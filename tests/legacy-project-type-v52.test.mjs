import test from "node:test";
import assert from "node:assert/strict";
import { mergeProjects, normalizeProject } from "../project-system.js";

test("IDs padrão sempre usam o formulário nativo, mesmo com legacyType inválido", () => {
  assert.equal(normalizeProject({ id: "programacao", legacyType: "custom" }).legacyType, "programacao");
  assert.equal(normalizeProject({ id: "cancelamento", legacyType: "custom" }).legacyType, "cancelamento");
  assert.equal(normalizeProject({ id: "tef_elgin", legacyType: "programacao" }).legacyType, "tef_elgin");
});

test("documentos do banco não substituem os formulários padrão por formulário vazio", () => {
  const projects = mergeProjects([
    { id: "cancelamento", name: "Cancelamento", legacyType: "custom", status: "published", active: true },
    { id: "tef_elgin", name: "TEF Elgin", status: "published", active: true }
  ]);
  assert.equal(projects.find((project) => project.id === "cancelamento")?.legacyType, "cancelamento");
  assert.equal(projects.find((project) => project.id === "tef_elgin")?.legacyType, "tef_elgin");
});

test("projetos personalizados permanecem custom", () => {
  assert.equal(normalizeProject({ id: "novo_projeto", legacyType: "custom" }).legacyType, "custom");
});
