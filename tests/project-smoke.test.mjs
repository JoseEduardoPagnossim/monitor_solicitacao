import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");

test("arquivos obrigatórios da publicação e migração existem", async () => {
  const files = [
    "index.html", "styles.css", "app.js", "project-system.js", "supabase-compat.js", "supabase-config.js", "security-config.js", "legal-config.js",
    "save-flow.js", "service-worker.js", "manifest.webmanifest", "VERSION", "version.json", "_headers",
    "request-forms/index.js", "request-forms/shared.js", "request-forms/programming-form.js",
    "request-forms/cancellation-form.js", "request-forms/tef-elgin-form.js", "request-forms/custom-project-form.js",
    "README.md", "PROJETOS_E_KANBAN_V48.md", "MIGRACAO_SUPABASE.md", "SECURITY.md", "SEGURANCA_URGENTE.md", "SEGURANCA_COMPLEMENTAR_V46.md", "POLITICA_E_TERMO_DE_USO.md", "TERMO_DE_USO_V47.md", "legal/termo-uso-confidencialidade-v1.html", "supabase/schema.sql", "supabase/bootstrap-admin.sql", "supabase/security-hardening-v45.sql", "supabase/security-hardening-v46.sql", "supabase/legal-terms-v47.sql", "supabase/projects-kanban-v48.sql", "supabase/hotfix-v53-identidade-projetos.sql",
    "scripts/migrate-firestore-to-supabase.mjs", "scripts/import-backup-to-supabase.mjs"
  ];
  await Promise.all(files.map((file) => access(path.join(root, file), fsConstants.R_OK)));
});

test("JavaScript publicado e scripts de migração possuem sintaxe válida", () => {
  for (const file of [
    "app.js", "project-system.js", "supabase-compat.js", "save-flow.js", "service-worker.js",
    "request-forms/index.js", "request-forms/shared.js", "request-forms/programming-form.js",
    "request-forms/cancellation-form.js", "request-forms/tef-elgin-form.js", "request-forms/custom-project-form.js",
    "scripts/migration-common.mjs", "scripts/migrate-firestore-to-supabase.mjs",
    "scripts/import-backup-to-supabase.mjs"
  ]) {
    execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "pipe" });
  }
});

test("versão está sincronizada nos arquivos principais", async () => {
  const [version, html, serviceWorker, versionJson, packageJson, packageLock] = await Promise.all([
    read("VERSION"), read("index.html"), read("service-worker.js"), read("version.json"), read("package.json"), read("package-lock.json")
  ]);
  const release = version.trim();
  assert.equal(release, "59");
  assert.match(html, new RegExp(`app\\.js\\?v=${release}\\.0\\.0`));
  assert.match(html, new RegExp(`styles\\.css\\?v=${release}\\.0\\.0`));
  assert.match(serviceWorker, new RegExp(`painel-solicitacoes-v${release}`));
  assert.equal(JSON.parse(versionJson).release, release);
  assert.equal(JSON.parse(packageJson).version, "0.59.0");
  assert.equal(JSON.parse(packageLock).version, "0.59.0");
  assert.equal(JSON.parse(packageLock).packages[""].version, "0.59.0");
});

test("frontend usa Supabase e não carrega SDK do Firebase", async () => {
  const app = await read("app.js");
  assert.match(app, /from "\.\/supabase-compat\.js"/);
  assert.match(app, /from "\.\/supabase-config\.js"/);
  assert.doesNotMatch(app, /gstatic\.com\/firebasejs/);
  assert.doesNotMatch(app, /firebase-config\.js/);
});

test("configuração pública não contém service_role", async () => {
  const config = await read("supabase-config.js");
  assert.match(config, /anonKey/);
  assert.doesNotMatch(config, /service[_-]?role\s*:/i);
});

test("rotina de salvamento possui timeout, repetição e bloqueio de duplo clique", async () => {
  const app = await read("app.js");
  assert.match(app, /requestSaveInProgress/);
  assert.match(app, /commitWithRetry\(commitRequestChanges/);
  assert.match(app, /REQUEST_SAVE_TIMEOUT_MS/);
  assert.match(app, /pendingCreateRequestId/);
  assert.match(app, /Tentando novamente/);
});

test("anexos mantêm identificador e são direcionados ao Storage", async () => {
  const [app, compat] = await Promise.all([read("app.js"), read("supabase-compat.js")]);
  assert.match(app, /attachment\.firestoreId/);
  assert.match(app, /doc\(db, "requestAttachments", attachment\.firestoreId\)/);
  assert.match(compat, /request-attachments/);
  assert.match(compat, /storagePath/);
  assert.match(compat, /\.upload\(/);
});

test("service worker publica os módulos do Supabase", async () => {
  const serviceWorker = await read("service-worker.js");
  assert.match(serviceWorker, /\.\/project-system\.js/);
  assert.match(serviceWorker, /\.\/supabase-compat\.js/);
  assert.match(serviceWorker, /\.\/supabase-config\.js/);
  assert.match(serviceWorker, /\.\/security-config\.js/);
  assert.match(serviceWorker, /\.\/legal-config\.js/);
  assert.match(serviceWorker, /termo-uso-confidencialidade-v1\.html/);
  assert.match(serviceWorker, /\.\/save-flow\.js/);
  assert.match(serviceWorker, /\.\/request-forms\/index\.js/);
  assert.match(serviceWorker, /\.\/request-forms\/programming-form\.js/);
  assert.match(serviceWorker, /\.\/request-forms\/cancellation-form\.js/);
  assert.match(serviceWorker, /\.\/request-forms\/tef-elgin-form\.js/);
  assert.match(serviceWorker, /\.\/request-forms\/custom-project-form\.js/);
  assert.match(serviceWorker, /networkFirstStatic/);
  assert.match(serviceWorker, /cache:\s*"no-store"/);
  assert.doesNotMatch(serviceWorker, /firebase-config\.js/);
});

test("workflow testa e usa o mesmo build estático no GitHub Pages e Cloudflare", async () => {
  const [workflow, buildScript] = await Promise.all([
    read(".github/workflows/pages.yml"),
    read("scripts/build-cloudflare.mjs")
  ]);
  assert.match(workflow, /actions\/checkout@v5/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /run: npm run build/);
  assert.match(workflow, /path: _site/);
  assert.match(workflow, /needs: build/);
  assert.match(buildScript, /project-system\.js/);
  assert.match(buildScript, /supabase-config\.js/);
  assert.match(buildScript, /security-config\.js/);
  assert.match(buildScript, /legal-config\.js/);
  assert.match(buildScript, /termo-uso-confidencialidade-v1\.html/);
  assert.match(buildScript, /cp\("request-forms"[\s\S]*recursive: true/);
  assert.doesNotMatch(buildScript, /migration-report|firebase-service-account|node_modules/i);
});


test("migração pode criar usuários ausentes sem expor senha temporária", async () => {
  const common = await readFile(path.join(root, "scripts/migration-common.mjs"), "utf8");
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.match(common, /auth\.admin\.createUser/);
  assert.match(common, /randomBytes\(32\)/);
  assert.doesNotMatch(common, /console\.log\([^\n]*temporaryPassword/);
  assert.match(packageJson.scripts["migrate:firebase:create-users"], /--create-missing-users/);
  assert.match(packageJson.scripts["import:backup:create-users"], /--create-missing-users/);
});

test("gravações separam inclusão e atualização para funcionar com RLS", async () => {
  const compat = await read("supabase-compat.js");
  assert.match(compat, /insertOrUpdateRow/);
  assert.match(compat, /\.from\(table\)\.insert\(payload\)/);
  assert.match(compat, /operation === "update"/);
  assert.doesNotMatch(compat, /from\(TABLE_DOCUMENTS\)\.upsert/);
});

test("patch v44 libera inclusão segura para o próprio solicitante e squad", async () => {
  const patch = await read("supabase/fix-request-save-v44.sql");
  assert.match(patch, /can_create_request_payload/);
  assert.match(patch, /safe_uuid\(p_data->>'requesterUid'\) = auth\.uid\(\)/);
  assert.match(patch, /p_data->>'squad'.*current_user_squad/s);
  assert.match(patch, /drop policy if exists documents_insert/);
});


test("patch v45 endurece auditoria, notificações e anexos", async () => {
  const [patch, compat] = await Promise.all([
    read("supabase/security-hardening-v45.sql"),
    read("supabase-compat.js")
  ]);
  assert.match(patch, /can_notify_request_target/i);
  assert.match(patch, /secure_document_insert_fields/i);
  assert.match(patch, /create_request_history/i);
  assert.match(patch, /create_request_notification/i);
  assert.match(patch, /can_edit_request\(request_id\)/i);
  assert.match(patch, /split_part\(name, '\/', 2\)/i);
  assert.match(compat, /rpc\("create_request_history"/);
  assert.match(compat, /rpc\("create_request_notification"/);
});

test("GitHub possui análise CodeQL e atualização de dependências", async () => {
  const [codeql, dependabot] = await Promise.all([
    read(".github/workflows/codeql.yml"),
    read(".github/dependabot.yml")
  ]);
  assert.match(codeql, /github\/codeql-action\/init@v3/);
  assert.match(codeql, /github\/codeql-action\/analyze@v3/);
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(dependabot, /package-ecosystem: github-actions/);
});
