import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");

test("arquivos obrigatórios da publicação existem", async () => {
  const files = [
    "index.html", "styles.css", "app.js", "save-flow.js", "firestore.rules",
    "service-worker.js", "manifest.webmanifest", "VERSION", "version.json",
    "README.md", "ATUALIZAR.txt"
  ];
  await Promise.all(files.map((file) => access(path.join(root, file), fsConstants.R_OK)));
});

test("JavaScript publicado possui sintaxe válida", () => {
  for (const file of ["app.js", "save-flow.js", "service-worker.js"]) {
    execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "pipe" });
  }
});

test("versão está sincronizada nos arquivos principais", async () => {
  const [version, html, serviceWorker, versionJson] = await Promise.all([
    read("VERSION"), read("index.html"), read("service-worker.js"), read("version.json")
  ]);
  const release = version.trim();
  assert.equal(release, "39");
  assert.match(html, new RegExp(`app\\.js\\?v=${release}\\.0\\.0`));
  assert.match(html, new RegExp(`styles\\.css\\?v=${release}\\.0\\.0`));
  assert.match(serviceWorker, new RegExp(`painel-solicitacoes-v${release}`));
  assert.equal(JSON.parse(versionJson).release, release);
});

test("rotina de salvamento possui timeout, repetição e bloqueio de duplo clique", async () => {
  const app = await read("app.js");
  assert.match(app, /requestSaveInProgress/);
  assert.match(app, /commitWithRetry\(commitRequestChanges/);
  assert.match(app, /REQUEST_SAVE_TIMEOUT_MS/);
  assert.match(app, /pendingCreateRequestId/);
  assert.match(app, /Tentando novamente/);
});

test("anexos reutilizam o mesmo identificador durante novas tentativas", async () => {
  const app = await read("app.js");
  assert.match(app, /attachment\.firestoreId/);
  assert.match(app, /doc\(db, "requestAttachments", attachment\.firestoreId\)/);
});

test("service worker publica o módulo de salvamento", async () => {
  const serviceWorker = await read("service-worker.js");
  assert.match(serviceWorker, /\.\/save-flow\.js/);
});

test("configuração particular do Firebase não é incluída no pacote versionado", async () => {
  await assert.rejects(access(path.join(root, "firebase-config.js"), fsConstants.F_OK));
});
