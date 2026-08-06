import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");

test("v59 oferece duplicação como uma nova solicitação preenchida", async () => {
  const [app, html] = await Promise.all([read("app.js"), read("index.html")]);

  assert.match(html, /id="duplicate-request-button"[^>]*>⧉ Duplicar solicitação<\/button>/);
  assert.match(app, /function duplicateRequestById\(id\)/);
  assert.match(app, /resetRequestForm\(\);[\s\S]*existingRequest: false/);
  assert.match(app, /requestModalTitle\.textContent = "Duplicar solicitação"/);
  assert.match(app, /saveRequestButton\.textContent = "Criar cópia"/);
});

test("v59 não replica anexos nem controle de CRM ao duplicar", async () => {
  const app = await read("app.js");

  assert.match(app, /attachments: \[\]/);
  assert.match(app, /cancellationCrmStatus: \{\}/);
  assert.match(app, /itemId: createCancellationItemId\(\)/);
  assert.match(app, /crmCancelled: false/);
});
