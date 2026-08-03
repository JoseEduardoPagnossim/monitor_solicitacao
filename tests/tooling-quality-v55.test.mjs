import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");

test("v55 adiciona ESLint e formatação reproduzível", async () => {
  await Promise.all([
    access(path.join(root, "eslint.config.js")),
    access(path.join(root, ".prettierrc.json")),
    access(path.join(root, ".prettierignore")),
    access(path.join(root, ".editorconfig"))
  ]);
  const packageJson = JSON.parse(await read("package.json"));
  assert.match(packageJson.scripts.lint, /eslint@10\.8\.0/);
  assert.match(packageJson.scripts.format, /prettier@3\.9\.6/);
  assert.match(packageJson.scripts["format:check"], /--check/);
  assert.match(packageJson.scripts.quality, /lint.*format:check.*test:unit.*build/);
});

test("v55 adiciona testes Playwright para login e troca de projetos", async () => {
  const files = [
    "playwright.config.mjs",
    "scripts/serve-static.mjs",
    "e2e/login.spec.mjs",
    "e2e/request-projects.spec.mjs",
    "e2e/support/mock-backend.mjs",
    "e2e/fixtures/supabase-compat.mock.js"
  ];
  await Promise.all(files.map((file) => access(path.join(root, file))));
  const [packageJsonText, projectSpec, workflow] = await Promise.all([
    read("package.json"),
    read("e2e/request-projects.spec.mjs"),
    read(".github/workflows/quality.yml")
  ]);
  const packageJson = JSON.parse(packageJsonText);
  assert.match(packageJson.scripts["test:e2e"], /playwright test/);
  assert.match(packageJson.scripts["test:e2e:setup"], /@playwright\/test@1\.57\.0/);
  assert.match(projectSpec, /selectOption\("cancelamento"\)/);
  assert.match(projectSpec, /selectOption\("tef_elgin"\)/);
  assert.match(projectSpec, /custom-project-fields/);
  assert.match(workflow, /Playwright no Chromium/);
  assert.match(workflow, /@playwright\/test@1\.57\.0/);
  assert.match(workflow, /install --with-deps chromium/);
});
