import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const app = await readFile(path.join(root, "app.js"), "utf8");

test("v54 não envia o evento change como se fosse uma solicitação", () => {
  assert.match(
    app,
    /requestType\.addEventListener\("change",\s*\(\)\s*=>\s*updateRequestTypeFields\(\)\)/
  );
  assert.doesNotMatch(
    app,
    /requestType\.addEventListener\("change",\s*updateRequestTypeFields\)/
  );
});

test("v54 ignora objetos Event recebidos por updateRequestTypeFields", () => {
  assert.match(app, /typeof item\.preventDefault === "function"/);
  assert.match(app, /const requestItem =[\s\S]*typeof item\.preventDefault/);
  assert.match(app, /requestItem[\s\S]*projectDefinitionForRequest\(requestItem\)[\s\S]*projectById\(projectId\)/);
  assert.match(app, /requestForms\.activate\(\{/);
});
