import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");

test("v47 exige aceite versionado antes de liberar os dados operacionais", async () => {
  const [app, compat, sql, html] = await Promise.all([
    read("app.js"),
    read("supabase-compat.js"),
    read("supabase/legal-terms-v47.sql"),
    read("index.html")
  ]);
  assert.match(app, /getLegalAcceptanceStatus/);
  assert.match(app, /acceptLegalTerms/);
  assert.match(app, /skipLegalCheck/);
  assert.match(app, /openLegalTermsDialog\(\{ required: true/);
  assert.match(compat, /rpc\("get_current_legal_status"/);
  assert.match(compat, /rpc\("accept_current_legal_terms"/);
  assert.match(sql, /documents_require_current_terms/);
  assert.match(sql, /attachments_require_current_terms/);
  assert.match(sql, /as restrictive/i);
  assert.match(html, /id="legal-terms-dialog"/);
  assert.match(html, /Não aceitar e sair/);
});

test("aceite registra versão, hash, data, usuário, dispositivo e evidência de auditoria", async () => {
  const sql = await read("supabase/legal-terms-v47.sql");
  assert.match(sql, /create table if not exists public\.legal_acceptances/);
  assert.match(sql, /email_snapshot/);
  assert.match(sql, /role_snapshot/);
  assert.match(sql, /user_agent/);
  assert.match(sql, /ip_address/);
  assert.match(sql, /legal_terms_accepted/);
  assert.match(sql, /unique \(user_id, document_version\)/);
});

test("documento publicado corresponde ao hash registrado no frontend e no SQL", async () => {
  const [content, config, sql] = await Promise.all([
    readFile(path.join(root, "legal/termo-uso-confidencialidade-v1.html")),
    read("legal-config.js"),
    read("supabase/legal-terms-v47.sql")
  ]);
  const hash = createHash("sha256").update(content).digest("hex");
  assert.match(config, new RegExp(hash));
  assert.match(sql, new RegExp(hash));
});

test("termo exige leitura e três confirmações e não pode ser fechado durante o aceite", async () => {
  const [app, html] = await Promise.all([read("app.js"), read("index.html")]);
  assert.match(app, /checkLegalDocumentScroll/);
  assert.match(app, /legalTermsRead\.checked/);
  assert.match(app, /legalTermsConfidentiality\.checked/);
  assert.match(app, /legalTermsMonitoring\.checked/);
  assert.match(app, /if \(state\.legalRequiredMode\) event\.preventDefault\(\)/);
  assert.match(html, /data-legal-required="false"/);
  assert.match(html, /id="accept-legal-terms"[^>]*disabled/);
});

test("e-mail não é mais armazenado separadamente em localStorage", async () => {
  const app = await read("app.js");
  assert.doesNotMatch(app, /painel-email/);
  assert.doesNotMatch(app, /localStorage\.setItem\([^\n]*loginEmail/);
});

test("admin visualiza no cadastro quem aceitou a versão vigente", async () => {
  const [app, html] = await Promise.all([read("app.js"), read("index.html")]);
  assert.match(app, /acceptedCurrentTerms/);
  assert.match(app, /termsAcceptedVersion/);
  assert.match(html, /Termo vigente/);
});
