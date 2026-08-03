import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  mergeProjects,
  normalizeProject,
  projectForRequest,
  resolveCanonicalProjectId,
  resolveProjectLegacyType
} from "../project-system.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("v53 usa o ID do documento como fonte de verdade para projetos padrão", () => {
  const project = normalizeProject({
    documentId: "cancelamento",
    id: "change",
    name: "change",
    legacyType: "custom",
    standardFields: { document: { enabled: true } },
    customFields: [{ id: "campo", label: "Campo" }]
  });

  assert.equal(project.id, "cancelamento");
  assert.equal(project.name, "Cancelamento");
  assert.equal(project.legacyType, "cancelamento");
  assert.deepEqual(project.standardFields, {});
  assert.deepEqual(project.customFields, []);
});

test("v53 remove duplicata personalizada que usa o nome de projeto padrão", () => {
  const projects = mergeProjects([
    { id: "change", name: "Cancelamento", legacyType: "custom", status: "published", active: true }
  ]);

  assert.equal(projects.filter((project) => project.id === "cancelamento").length, 1);
  assert.equal(projects.some((project) => project.id === "change"), false);
  assert.equal(projects.find((project) => project.id === "cancelamento")?.legacyType, "cancelamento");
});

test("v53 direciona solicitações antigas de duplicatas para o formulário nativo", () => {
  const project = projectForRequest({
    projectId: "change",
    projectName: "Cancelamento",
    type: "custom"
  }, []);

  assert.equal(project.id, "cancelamento");
  assert.equal(resolveProjectLegacyType(project), "cancelamento");
});

test("v53 prioriza IDs canônicos antes de legacyType corrompido", () => {
  assert.equal(resolveCanonicalProjectId({ id: "tef_elgin", legacyType: "custom" }), "tef_elgin");
  assert.equal(resolveProjectLegacyType({ id: "programacao", legacyType: "custom" }), "programacao");
});

test("frontend força o ID da linha do Supabase e usa o resolvedor central", async () => {
  const app = await readFile(path.join(root, "app.js"), "utf8");
  assert.match(app, /documentId:\s*documentSnapshot\.id/);
  assert.match(app, /id:\s*documentSnapshot\.id/);
  assert.match(app, /return resolveProjectLegacyType\(project\)/);
});

test("hotfix v53 restaura projetos oficiais e arquiva duplicatas", async () => {
  const sql = await readFile(path.join(root, "supabase/hotfix-v53-identidade-projetos.sql"), "utf8");
  assert.match(sql, /on conflict \(collection_name, id\) do update/i);
  assert.match(sql, /v53_project_aliases/i);
  assert.match(sql, /'projectId', alias\.canonical_id/i);
  assert.match(sql, /'status', 'archived'/i);
});
