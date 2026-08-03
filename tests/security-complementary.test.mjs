import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");

test("v46 aplica política forte de senha sem bloquear símbolos", async () => {
  const [app, config, html] = await Promise.all([read("app.js"), read("security-config.js"), read("index.html")]);
  assert.match(config, /minLength:\s*10/);
  assert.match(config, /requireUppercase:\s*true/);
  assert.match(config, /requireLowercase:\s*true/);
  assert.match(config, /requireNumber:\s*true/);
  assert.match(config, /requireSymbol:\s*true/);
  assert.match(app, /function passwordPolicyError/);
  assert.match(app, /\[\^A-Za-z0-9\\s\]/);
  assert.match(html, /id="new-password"[^>]*minlength="10"/);
});

test("CAPTCHA é opcional, público e integrado aos fluxos de autenticação", async () => {
  const [app, compat, config, html] = await Promise.all([
    read("app.js"), read("supabase-compat.js"), read("security-config.js"), read("index.html")
  ]);
  assert.match(config, /turnstileSiteKey:\s*"[^"]*"/);
  assert.match(app, /challenges\.cloudflare\.com\/turnstile\/v0\/api\.js\?render=explicit/);
  assert.match(app, /requireCaptchaToken\("login"/);
  assert.match(app, /requireCaptchaToken\("invite"/);
  assert.match(app, /requireCaptchaToken\("reset"/);
  assert.match(compat, /captchaToken/);
  assert.match(html, /frame-src[^;]*https:\/\/challenges\.cloudflare\.com/);
});

test("MFA TOTP possui cadastro, desafio no login e remoção protegida", async () => {
  const [app, compat, html] = await Promise.all([read("app.js"), read("supabase-compat.js"), read("index.html")]);
  assert.match(compat, /mfa\.enroll/);
  assert.match(compat, /mfa\.challenge/);
  assert.match(compat, /mfa\.verify/);
  assert.match(compat, /mfa\.unenroll/);
  assert.match(app, /ensureMfaChallengeBeforeApp/);
  assert.match(app, /currentLevel === "aal2"/);
  assert.match(app, /submitMfaEnrollment/);
  assert.match(app, /submitMfaChallenge/);
  assert.match(html, /id="mfa-enrollment-dialog"/);
  assert.match(html, /id="mfa-challenge-dialog"/);
});

test("patch v46 exige AAL2 apenas de contas que já ativaram MFA", async () => {
  const sql = await read("supabase/security-hardening-v46.sql");
  assert.match(sql, /auth\.mfa_factors/i);
  assert.match(sql, /f\.status = 'verified'/i);
  assert.match(sql, /auth\.jwt\(\)->>'aal'.*'aal2'/is);
  assert.match(sql, /as restrictive/i);
  assert.match(sql, /documents_require_verified_mfa/i);
  assert.match(sql, /attachments_require_verified_mfa/i);
});

test("ações administrativas e backup exigem confirmação recente de senha", async () => {
  const [app, html] = await Promise.all([read("app.js"), read("index.html")]);
  assert.match(app, /function ensureSensitiveAuthorization/);
  assert.match(app, /SENSITIVE_AUTHORIZATION_MS/);
  assert.match(app, /createUserInvite[\s\S]*ensureSensitiveAuthorization/);
  assert.match(app, /saveUserProfile[\s\S]*ensureSensitiveAuthorization/);
  assert.match(app, /submitBackupRequest[\s\S]*ensureSensitiveAuthorization/);
  assert.match(html, /id="reauth-dialog"/);
});

test("backup registra finalidade, classificação, retenção e hash SHA-256", async () => {
  const app = await read("app.js");
  assert.match(app, /classification:\s*"CONFIDENCIAL - DADOS DE CLIENTES"/);
  assert.match(app, /purpose,/);
  assert.match(app, /deleteAfter/);
  assert.match(app, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(app, /backup_requested/);
  assert.match(app, /backup_generated/);
  assert.match(app, /backup_failed/);
});

test("anexos são validados por assinatura e recebem nome interno aleatório", async () => {
  const [app, compat, sql] = await Promise.all([
    read("app.js"), read("supabase-compat.js"), read("supabase/security-hardening-v46.sql")
  ]);
  assert.match(app, /bytes\[0\] === 0xff[\s\S]*bytes\[1\] === 0xd8/);
  assert.match(app, /bytes\[0\] === 0x89[\s\S]*bytes\[1\] === 0x50/);
  assert.match(app, /TextDecoder\("utf-8", \{ fatal: true \}\)/);
  assert.match(app, /attachment-invalid-content/);
  assert.match(compat, /crypto\.randomUUID\(\)/);
  assert.match(compat, /upsert:\s*false/);
  assert.match(sql, /file_size_limit = 716800/);
  assert.match(sql, /allowed_mime_types/);
});

test("logout limpa sessão local e solicita limpeza de cache privado", async () => {
  const [app, compat, worker] = await Promise.all([read("app.js"), read("supabase-compat.js"), read("service-worker.js")]);
  assert.match(app, /async function secureSignOut/);
  assert.match(app, /clearAuthSessionStorage\(\)/);
  assert.match(app, /CLEAR_PRIVATE_CACHE/);
  assert.match(compat, /localStorage\.removeItem\(AUTH_STORAGE_KEY\)/);
  assert.match(compat, /sessionStorage\.removeItem\(AUTH_STORAGE_KEY\)/);
  assert.match(worker, /event\.data\?\.type !== "CLEAR_PRIVATE_CACHE"/);
});

test("service worker não armazena respostas arbitrárias da aplicação", async () => {
  const worker = await read("service-worker.js");
  assert.match(worker, /STATIC_PATHS/);
  assert.match(worker, /event\.request\.mode === "navigate"/);
  assert.match(worker, /if \(STATIC_PATHS\.has\(url\.pathname\)\)/);
  assert.doesNotMatch(worker, /cache\.put\(event\.request, copy\)/);
});


test("confirmação de senha usa cliente temporário e preserva a sessão MFA ativa", async () => {
  const [app, compat] = await Promise.all([read("app.js"), read("supabase-compat.js")]);
  assert.match(compat, /const temporaryClient = createClient/);
  assert.match(compat, /persistSession:\s*false/);
  assert.match(compat, /temporaryClient\.auth\.signInWithPassword/);
  assert.match(app, /requireCaptchaToken\("reauth"/);
  assert.match(app, /requireCaptchaToken\("changePassword"/);
});

test("schema de instalação nova também contém a proteção complementar de MFA", async () => {
  const schema = await read("supabase/schema.sql");
  assert.match(schema, /current_user_mfa_satisfied/);
  assert.match(schema, /documents_require_verified_mfa/);
  assert.match(schema, /file_size_limit, allowed_mime_types[\s\S]*716800/);
});

test("build público inclui a configuração de segurança sem arquivos administrativos", async () => {
  const [workflow, buildScript] = await Promise.all([
    read(".github/workflows/pages.yml"),
    read("scripts/build-cloudflare.mjs")
  ]);
  assert.match(workflow, /run: npm run build/);
  assert.match(buildScript, /security-config\.js/);
  assert.doesNotMatch(buildScript, /security-hardening-v46\.sql/);
  assert.doesNotMatch(buildScript, /SEGURANCA_COMPLEMENTAR_V46\.md/);
});
