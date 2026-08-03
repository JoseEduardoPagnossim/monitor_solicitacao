export const LEGACY_PROJECT_IDS = Object.freeze({
  programacao: "programacao",
  cancelamento: "cancelamento",
  tef_elgin: "tef_elgin"
});

export const DEFAULT_PROJECTS = Object.freeze([
  {
    id: "programacao",
    name: "Programação",
    description: "Solicitações de programação e melhoria do sistema.",
    audience: "all",
    status: "published",
    active: true,
    legacyType: "programacao",
    order: 10,
    standardFields: {},
    customFields: []
  },
  {
    id: "cancelamento",
    name: "Cancelamento",
    description: "Chamados de cancelamento de clientes.",
    audience: "all",
    status: "published",
    active: true,
    legacyType: "cancelamento",
    order: 20,
    standardFields: {},
    customFields: []
  },
  {
    id: "tef_elgin",
    name: "TEF Elgin",
    description: "Solicitações de implantação e configuração de TEF Elgin.",
    audience: "all",
    status: "published",
    active: true,
    legacyType: "tef_elgin",
    order: 30,
    standardFields: {},
    customFields: []
  }
]);

export const DEFAULT_KANBAN_COLUMNS = Object.freeze([
  { id: "nova", name: "Nova", order: 10, active: true, pausesTimer: false, completed: false, color: "blue" },
  { id: "analise", name: "Em análise", order: 20, active: true, pausesTimer: false, completed: false, color: "purple" },
  { id: "aguardando", name: "Aguardando", order: 30, active: true, pausesTimer: true, completed: false, color: "amber" },
  { id: "bloqueio", name: "Bloqueio", order: 40, active: true, pausesTimer: true, completed: false, color: "red" },
  { id: "concluida", name: "Concluída", order: 50, active: true, pausesTimer: false, completed: true, color: "green" }
]);

export const STANDARD_FIELD_DEFINITIONS = Object.freeze({
  document: { label: "CPF/CNPJ", type: "document", maxLength: 18 },
  companyName: { label: "Razão Social", type: "text", maxLength: 120 },
  phone: { label: "Telefone", type: "phone", maxLength: 15 },
  email: { label: "E-mail", type: "email", maxLength: 160 }
});

export function slugifyIdentifier(value, prefix = "item") {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return normalized || `${prefix}_${Date.now().toString(36)}`;
}

export function normalizeProject(raw = {}) {
  const id = String(raw.id || slugifyIdentifier(raw.name, "project"));
  const canonicalLegacyType = Object.prototype.hasOwnProperty.call(LEGACY_PROJECT_IDS, id)
    ? LEGACY_PROJECT_IDS[id]
    : "";
  const explicitLegacyType = ["programacao", "cancelamento", "tef_elgin"].includes(raw.legacyType)
    ? raw.legacyType
    : "";
  const project = {
    id,
    name: String(raw.name || "Projeto sem nome").trim().slice(0, 100),
    description: String(raw.description || "").trim().slice(0, 500),
    audience: ["admin", "solicitante", "all"].includes(raw.audience) ? raw.audience : "all",
    status: ["draft", "published", "archived"].includes(raw.status) ? raw.status : "published",
    active: raw.active !== false,
    legacyType: canonicalLegacyType || explicitLegacyType || "custom",
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : 100,
    standardFields: raw.standardFields && typeof raw.standardFields === "object" ? raw.standardFields : {},
    customFields: Array.isArray(raw.customFields) ? raw.customFields.map(normalizeProjectField) : [],
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null
  };
  return project;
}

export function normalizeProjectField(raw = {}, index = 0) {
  return {
    id: String(raw.id || slugifyIdentifier(raw.label || raw.name, `field_${index + 1}`)),
    label: String(raw.label || raw.name || `Campo ${index + 1}`).trim().slice(0, 100),
    placeholder: String(raw.placeholder || "").trim().slice(0, 1000),
    required: raw.required === true,
    active: raw.active !== false,
    type: ["long_text", "text"].includes(raw.type) ? raw.type : "long_text",
    maxLength: Math.min(1000, Math.max(1, Number(raw.maxLength || 1000))),
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : (index + 1) * 10
  };
}

export function normalizeKanbanColumn(raw = {}, index = 0) {
  return {
    id: String(raw.id || slugifyIdentifier(raw.name, `column_${index + 1}`)),
    name: String(raw.name || `Coluna ${index + 1}`).trim().slice(0, 80),
    order: Number.isFinite(Number(raw.order)) ? Number(raw.order) : (index + 1) * 10,
    active: raw.active !== false,
    pausesTimer: raw.pausesTimer === true,
    completed: raw.completed === true,
    color: ["blue", "purple", "amber", "red", "green", "cyan", "gray"].includes(raw.color) ? raw.color : "blue",
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null
  };
}

export function mergeProjects(projects = []) {
  const merged = new Map(DEFAULT_PROJECTS.map((project) => [project.id, normalizeProject(project)]));
  projects.map(normalizeProject).forEach((project) => merged.set(project.id, project));
  return [...merged.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"));
}

export function mergeKanbanColumns(columns = []) {
  const merged = new Map(DEFAULT_KANBAN_COLUMNS.map((column, index) => [column.id, normalizeKanbanColumn(column, index)]));
  columns.map(normalizeKanbanColumn).forEach((column) => merged.set(column.id, column));
  return [...merged.values()].sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"));
}

export function projectVisibleToRole(project, role) {
  const normalized = normalizeProject(project);
  if (!normalized.active || normalized.status !== "published") return false;
  if (role === "admin") return normalized.audience === "all" || normalized.audience === "admin" || normalized.audience === "solicitante";
  return normalized.audience === "all" || normalized.audience === "solicitante";
}

export function projectAllowsCreation(project, role) {
  const normalized = normalizeProject(project);
  if (!normalized.active || normalized.status !== "published") return false;
  if (role === "admin") return normalized.audience === "all" || normalized.audience === "admin";
  return normalized.audience === "all" || normalized.audience === "solicitante";
}

export function projectForRequest(request, projects = []) {
  const projectId = String(request?.projectId || request?.type || "programacao");
  return mergeProjects(projects).find((project) => project.id === projectId)
    || normalizeProject({ id: projectId, name: request?.projectName || projectId, legacyType: request?.type || "custom" });
}

export function firstOpenColumn(columns = []) {
  const active = mergeKanbanColumns(columns).filter((column) => column.active !== false);
  return active.find((column) => !column.completed)
    || active[0]
    || normalizeKanbanColumn(DEFAULT_KANBAN_COLUMNS[0]);
}

export function completedColumnIds(columns = []) {
  return new Set(mergeKanbanColumns(columns).filter((column) => column.active !== false && column.completed).map((column) => column.id));
}

export function pausedColumnIds(columns = []) {
  return new Set(mergeKanbanColumns(columns).filter((column) => column.active !== false && column.pausesTimer).map((column) => column.id));
}

export function validateProjectDefinition(project = {}) {
  const normalized = normalizeProject(project);
  const errors = [];
  if (!normalized.name || normalized.name.length < 2) errors.push("Informe um nome de projeto com pelo menos 2 caracteres.");
  if (!["admin", "solicitante", "all"].includes(normalized.audience)) errors.push("Selecione quem pode criar solicitações.");
  const ids = new Set();
  normalized.customFields.filter((field) => field.active).forEach((field) => {
    if (!field.label) errors.push("Todo campo personalizado precisa de um nome.");
    if (ids.has(field.id)) errors.push(`O campo “${field.label}” possui identificador duplicado.`);
    ids.add(field.id);
  });
  return { valid: errors.length === 0, errors, project: normalized };
}

export function validateDynamicRequest(project, values = {}, validators = {}) {
  const normalized = normalizeProject(project);
  const errors = [];
  const output = { standard: {}, custom: {} };
  const standardConfig = normalized.standardFields || {};

  Object.entries(STANDARD_FIELD_DEFINITIONS).forEach(([key, definition]) => {
    const config = standardConfig[key];
    if (!config?.enabled) return;
    const value = String(values.standard?.[key] || "").trim().slice(0, definition.maxLength);
    if (config.required && !value) errors.push(`Preencha o campo ${definition.label}.`);
    if (value && definition.type === "document" && validators.isValidDocument && !validators.isValidDocument(value)) errors.push("Informe um CPF/CNPJ válido.");
    if (value && definition.type === "phone" && validators.isValidPhone && !validators.isValidPhone(value)) errors.push("Informe um telefone válido com DDD.");
    if (value && definition.type === "email" && validators.isValidEmail && !validators.isValidEmail(value)) errors.push("Informe um e-mail válido.");
    output.standard[key] = value;
  });

  normalized.customFields.filter((field) => field.active).forEach((field) => {
    const value = String(values.custom?.[field.id] || "").trim().slice(0, field.maxLength);
    if (field.required && !value) errors.push(`Preencha o campo ${field.label}.`);
    output.custom[field.id] = value;
  });

  return { valid: errors.length === 0, errors, values: output };
}

export function requestSearchText(request = {}, project = null) {
  const values = request.customFieldValues && typeof request.customFieldValues === "object"
    ? Object.values(request.customFieldValues)
    : [];
  return [
    request.projectName,
    project?.name,
    request.clientName,
    request.clientCode,
    request.companyName,
    request.document,
    request.phone,
    request.contactEmail,
    request.title,
    request.description,
    request.requesterName,
    request.requesterEmail,
    request.assigneeName,
    ...values
  ].filter(Boolean).join(" ").toLocaleLowerCase("pt-BR");
}
