import test from "node:test";
import assert from "node:assert/strict";
import { mergeProjects, normalizeProject } from "../project-system.js";

test("projetos padrão preservam o formulário legado mesmo sem legacyType no banco", () => {
  assert.equal(normalizeProject({ id: "programacao", name: "Programação" }).legacyType, "programacao");
  assert.equal(normalizeProject({ id: "cancelamento", name: "Cancelamento" }).legacyType, "cancelamento");
  assert.equal(normalizeProject({ id: "tef_elgin", name: "TEF Elgin" }).legacyType, "tef_elgin");
});

test("registro do banco sem legacyType não substitui o projeto padrão por formulário vazio", () => {
  const projects = mergeProjects([
    { id: "cancelamento", name: "Cancelamento", description: "change", status: "published", active: true },
    { id: "tef_elgin", name: "TEF Elgin", status: "published", active: true }
  ]);
  assert.equal(projects.find((project) => project.id === "cancelamento")?.legacyType, "cancelamento");
  assert.equal(projects.find((project) => project.id === "tef_elgin")?.legacyType, "tef_elgin");
});

test("projetos realmente personalizados continuam como custom", () => {
  assert.equal(normalizeProject({ id: "novo_projeto", name: "Novo projeto" }).legacyType, "custom");
});
