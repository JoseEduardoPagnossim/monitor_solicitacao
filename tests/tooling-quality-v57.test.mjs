import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");

test("v57 corrige os erros de lint reportados na versão 56", async () => {
  const [app, eslintConfig, fixture, saveFlowTest] = await Promise.all([
    read("app.js"),
    read("eslint.config.js"),
    read("e2e/fixtures/supabase-compat.mock.js"),
    read("tests/save-flow.test.mjs")
  ]);

  assert.match(app, /function removeControlCharacters/);
  assert.match(app, /\.replaceAll\("\/", "_"\)/);
  assert.doesNotMatch(app, /replace\(\/\[\\u0000-/);
  assert.match(eslintConfig, /fixture-e2e-no-navegador/);
  assert.match(fixture, /"__AUTHENTICATED__" === "true"/);
  assert.match(saveFlowTest, /new Promise\(\(resolve\) => \{\s*setTimeout\(resolve, milliseconds\);/);
});

test("v57 instala o pacote oficial do Playwright antes dos testes E2E", async () => {
  const [config, loginSpec, projectSpec, workflow] = await Promise.all([
    read("playwright.config.mjs"),
    read("e2e/login.spec.mjs"),
    read("e2e/request-projects.spec.mjs"),
    read(".github/workflows/quality.yml")
  ]);

  assert.match(config, /from "@playwright\/test"/);
  assert.match(loginSpec, /from "@playwright\/test"/);
  assert.match(projectSpec, /from "@playwright\/test"/);
  assert.match(workflow, /npm install --no-save --package-lock=false @playwright\/test@1\.57\.0/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
});
