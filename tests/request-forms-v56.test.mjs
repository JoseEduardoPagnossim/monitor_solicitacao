import test from "node:test";
import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");

const formFiles = [
  "request-forms/index.js",
  "request-forms/shared.js",
  "request-forms/programming-form.js",
  "request-forms/cancellation-form.js",
  "request-forms/tef-elgin-form.js",
  "request-forms/custom-project-form.js"
];

test("v56 separa os quatro formulários em módulos com contrato comum", async () => {
  await Promise.all(formFiles.map((file) => access(path.join(root, file))));
  const [registry, programming, cancellation, tef, custom] = await Promise.all([
    read("request-forms/index.js"),
    read("request-forms/programming-form.js"),
    read("request-forms/cancellation-form.js"),
    read("request-forms/tef-elgin-form.js"),
    read("request-forms/custom-project-form.js")
  ]);

  assert.match(registry, /programacao: programming/);
  assert.match(registry, /cancelamento: cancellation/);
  assert.match(registry, /tef_elgin: tefElgin/);
  assert.match(registry, /custom/);
  for (const source of [programming, cancellation, tef, custom]) {
    assert.match(source, /function setActive/);
    assert.match(source, /function reset/);
    assert.match(source, /function buildPayload/);
    assert.match(source, /function focus/);
  }
});

test("v56 mantém app.js como orquestrador e não duplica builders dos formulários", async () => {
  const app = await read("app.js");
  assert.match(app, /from "\.\/request-forms\/index\.js"/);
  assert.match(app, /createRequestFormRegistry/);
  assert.match(app, /requestForms\.buildPayload\(project\)/);
  assert.doesNotMatch(app, /function buildProgrammingPayload/);
  assert.doesNotMatch(app, /function buildCancellationPayload/);
  assert.doesNotMatch(app, /function buildTefPayload/);
  assert.doesNotMatch(app, /function buildCustomProjectPayload/);
});

test("v56 publica os módulos tanto no GitHub Pages quanto no Cloudflare Pages", async () => {
  const [workflow, buildScript, serviceWorker] = await Promise.all([
    read(".github/workflows/pages.yml"),
    read("scripts/build-cloudflare.mjs"),
    read("service-worker.js")
  ]);
  assert.match(workflow, /run: npm run build/);
  assert.match(workflow, /path: _site/);
  assert.match(buildScript, /cp\("request-forms"[\s\S]*recursive: true/);
  assert.match(serviceWorker, /request-forms\/index\.js/);
  assert.match(serviceWorker, /request-forms\/custom-project-form\.js/);
});
