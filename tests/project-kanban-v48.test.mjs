import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_PROJECTS,
  DEFAULT_KANBAN_COLUMNS,
  mergeProjects,
  mergeKanbanColumns,
  normalizeProject,
  projectVisibleToRole,
  projectAllowsCreation,
  firstOpenColumn,
  completedColumnIds,
  pausedColumnIds,
  validateProjectDefinition,
  validateDynamicRequest,
  requestSearchText
} from "../project-system.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");

const validators = {
  isValidDocument: (value) => ["12345678909", "11222333000181"].includes(String(value).replace(/\D/g, "")),
  isValidPhone: (value) => [10, 11].includes(String(value).replace(/\D/g, "").length),
  isValidEmail: (value) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
};

test("v48 mantém os três tipos históricos como projetos padrão", () => {
  assert.deepEqual(DEFAULT_PROJECTS.map((project) => project.id), ["programacao", "cancelamento", "tef_elgin"]);
  assert.equal(mergeProjects([]).length, 3);
  assert.equal(mergeProjects([]).every((project) => project.status === "published"), true);
});

test("permissão de criação respeita administrador, solicitante e todos", () => {
  const admin = normalizeProject({ id: "a", name: "Admin", audience: "admin", status: "published", active: true });
  const requester = normalizeProject({ id: "s", name: "Solicitante", audience: "solicitante", status: "published", active: true });
  const all = normalizeProject({ id: "t", name: "Todos", audience: "all", status: "published", active: true });
  assert.equal(projectAllowsCreation(admin, "admin"), true);
  assert.equal(projectAllowsCreation(admin, "solicitante"), false);
  assert.equal(projectAllowsCreation(requester, "admin"), false);
  assert.equal(projectAllowsCreation(requester, "solicitante"), true);
  assert.equal(projectAllowsCreation(all, "admin"), true);
  assert.equal(projectAllowsCreation(all, "solicitante"), true);
  assert.equal(projectVisibleToRole(requester, "admin"), true, "admin ainda administra todos os projetos");
});

test("rascunhos e projetos arquivados não permitem novas solicitações", () => {
  assert.equal(projectAllowsCreation({ name: "Rascunho", status: "draft", audience: "all", active: true }, "admin"), false);
  assert.equal(projectAllowsCreation({ name: "Arquivado", status: "archived", audience: "all", active: false }, "solicitante"), false);
});

test("construtor valida nome e identificadores duplicados", () => {
  const invalid = validateProjectDefinition({
    name: "X",
    audience: "all",
    customFields: [
      { id: "motivo", label: "Motivo" },
      { id: "motivo", label: "Outro motivo" }
    ]
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((message) => message.includes("pelo menos 2")));
  assert.ok(invalid.errors.some((message) => message.includes("duplicado")));
});

test("formulário dinâmico aplica obrigatoriedade e validações dos campos padrão", () => {
  const project = normalizeProject({
    id: "acesso",
    name: "Solicitação de acesso",
    standardFields: {
      document: { enabled: true, required: true },
      companyName: { enabled: true, required: true },
      phone: { enabled: true, required: false },
      email: { enabled: true, required: true }
    },
    customFields: []
  });
  const invalid = validateDynamicRequest(project, { standard: { document: "111", companyName: "", email: "invalido" } }, validators);
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some((message) => message.includes("CPF/CNPJ")));
  assert.ok(invalid.errors.some((message) => message.includes("Razão Social")));
  assert.ok(invalid.errors.some((message) => message.includes("e-mail")));

  const valid = validateDynamicRequest(project, {
    standard: { document: "123.456.789-09", companyName: "Empresa Teste", phone: "(11) 99999-9999", email: "teste@empresa.com" }
  }, validators);
  assert.equal(valid.valid, true);
});

test("campos personalizados usam placeholder, obrigatoriedade e limite de mil caracteres", () => {
  const project = normalizeProject({
    id: "equipamento",
    name: "Equipamento",
    customFields: [{ id: "justificativa", label: "Justificativa", placeholder: "Explique a necessidade", required: true, maxLength: 1000 }]
  });
  assert.equal(project.customFields[0].placeholder, "Explique a necessidade");
  assert.equal(project.customFields[0].maxLength, 1000);
  assert.equal(validateDynamicRequest(project, { custom: { justificativa: "" } }, validators).valid, false);
  assert.equal(validateDynamicRequest(project, { custom: { justificativa: "Uso interno" } }, validators).valid, true);
  const oversized = validateDynamicRequest(project, { custom: { justificativa: "x".repeat(1100) } }, validators);
  assert.equal(oversized.values.custom.justificativa.length, 1000);
});

test("colunas dinâmicas preservam arquivadas, mas cálculos usam somente ativas", () => {
  const columns = mergeKanbanColumns([
    ...DEFAULT_KANBAN_COLUMNS,
    { id: "triagem", name: "Triagem", order: 5, active: false, pausesTimer: true, completed: false }
  ]);
  assert.equal(columns.some((column) => column.id === "triagem" && column.active === false), true);
  assert.equal(firstOpenColumn(columns).id, "nova");
  assert.equal(pausedColumnIds(columns).has("triagem"), false);
  assert.equal(completedColumnIds(columns).has("concluida"), true);
});

test("busca inclui projeto, dados padrão e respostas personalizadas", () => {
  const text = requestSearchText({
    projectName: "Acesso",
    companyName: "Cliente Exemplo",
    customFieldValues: { motivo: "Novo colaborador" }
  });
  assert.match(text, /acesso/);
  assert.match(text, /cliente exemplo/);
  assert.match(text, /novo colaborador/);
});

test("interface v48 possui Kanban único e administração de projetos e colunas", async () => {
  const [html, app, worker, workflow] = await Promise.all([
    read("index.html"), read("app.js"), read("service-worker.js"), read(".github/workflows/pages.yml")
  ]);
  assert.match(html, /id="projects-view"/);
  assert.match(html, /id="columns-view"/);
  assert.match(html, /id="project-dialog"/);
  assert.match(html, /id="column-dialog"/);
  assert.match(html, /id="custom-project-fields"/);
  assert.doesNotMatch(html, /data-filter-type="(?:programacao|cancelamento|tef_elgin)"/);
  assert.match(app, /collection\(db, "requestProjects"\)/);
  assert.match(app, /collection\(db, "kanbanColumns"\)/);
  assert.match(app, /renderKanbanStructure/);
  assert.match(app, /validateDynamicRequest/);
  assert.match(worker, /\.\/project-system\.js/);
  assert.match(workflow, /project-system\.js/);
});

test("patch v48 cria, migra e protege projetos, colunas e formulários", async () => {
  const sql = await read("supabase/projects-kanban-v48.sql");
  assert.match(sql, /'requestProjects', 'programacao'/);
  assert.match(sql, /'kanbanColumns', 'nova'/);
  assert.match(sql, /project_allows_current_user/);
  assert.match(sql, /validate_request_schema/);
  assert.match(sql, /valid_cpf_cnpj/);
  assert.match(sql, /first_active_kanban_column/);
  assert.match(sql, /v48_secure_projects_and_requests/);
  assert.match(sql, /immutable-project/);
  assert.match(sql, /collection_name in \('requests','archivedRequests'\)/);
  assert.match(sql, /v48_configurations_cannot_be_deleted/);
  assert.match(sql, /documents_select/);
});

test("solicitações antigas usam o snapshot do formulário ao abrir e salvar", async () => {
  const app = await read("app.js");
  assert.match(app, /function projectDefinitionForRequest/);
  assert.match(app, /projectFormSnapshot/);
  assert.match(app, /const project = existing \? projectDefinitionForRequest\(existing\) : selectedProject/);
  assert.match(app, /Campos do projeto \(\$\{changedCustomFields/);
});

test("Supabase usa o esquema oficial do projeto e não confia no esquema enviado pelo navegador", async () => {
  const sql = await read("supabase/projects-kanban-v48.sql");
  assert.match(sql, /Em novas solicitações, o esquema sempre vem do cadastro do projeto/);
  assert.match(sql, /v_schema := jsonb_build_object\(/);
  assert.match(sql, /validate_request_schema\(new\.data, v_schema\)/);
  assert.match(sql, /v_is_restore := public\.current_user_is_admin\(\) and exists/);
  assert.match(sql, /collection_name = 'archivedRequests'/);
});

test("configurações arquivadas continuam legíveis para preservar nomes e histórico", async () => {
  const [sql, app] = await Promise.all([read("supabase/projects-kanban-v48.sql"), read("app.js")]);
  assert.match(sql, /collection_name in \('requestProjects','kanbanColumns'\)/);
  assert.match(app, /function filterableProjects/);
  assert.match(app, /usedProjectIds\.has\(project\.id\)/);
  assert.match(app, /Mova todas as solicitações ativas desta coluna/);
});
