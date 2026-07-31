import test from "node:test";
import assert from "node:assert/strict";
import { readFile, access } from "node:fs/promises";
import { constants as fsConstants } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");

test("arquivos obrigatórios da publicação e migração existem", async () => {
  const files = [
    "index.html", "styles.css", "app.js", "supabase-compat.js", "supabase-config.js",
    "save-flow.js", "service-worker.js", "manifest.webmanifest", "VERSION", "version.json",
    "README.md", "MIGRACAO_SUPABASE.md", "SECURITY.md", "SEGURANCA_URGENTE.md", "supabase/schema.sql", "supabase/bootstrap-admin.sql", "supabase/security-hardening-v45.sql",
    "scripts/migrate-firestore-to-supabase.mjs", "scripts/import-backup-to-supabase.mjs"
  ];
  await Promise.all(files.map((file) => access(path.join(root, file), fsConstants.R_OK)));
});

test("JavaScript publicado e scripts de migração possuem sintaxe válida", () => {
  for (const file of [
    "app.js", "supabase-compat.js", "save-flow.js", "service-worker.js",
    "scripts/migration-common.mjs", "scripts/migrate-firestore-to-supabase.mjs",
    "scripts/import-backup-to-supabase.mjs"
  ]) {
    execFileSync(process.execPath, ["--check", path.join(root, file)], { stdio: "pipe" });
  }
});

test("versão está sincronizada nos arquivos principais", async () => {
  const [version, html, serviceWorker, versionJson, packageJson, packageLock] = await Promise.all([
    read("VERSION"), read("index.html"), read("service-worker.js"), read("version.json"), read("package.json"), read("package-lock.json")
  ]);
  const release = version.trim();
  assert.equal(release, "45");
  assert.match(html, new RegExp(`app\\.js\\?v=${release}\\.0\\.0`));
  assert.match(html, new RegExp(`styles\\.css\\?v=${release}\\.0\\.0`));
  assert.match(serviceWorker, new RegExp(`painel-solicitacoes-v${release}`));
  assert.equal(JSON.parse(versionJson).release, release);
  assert.equal(JSON.parse(packageJson).version, "0.45.0");
  assert.equal(JSON.parse(packageLock).version, "0.45.0");
  assert.equal(JSON.parse(packageLock).packages[""].version, "0.45.0");
});

test("frontend usa Supabase e não carrega SDK do Firebase", async () => {
  const app = await read("app.js");
  assert.match(app, /from "\.\/supabase-compat\.js"/);
  assert.match(app, /from "\.\/supabase-config\.js"/);
  assert.doesNotMatch(app, /gstatic\.com\/firebasejs/);
  assert.doesNotMatch(app, /firebase-config\.js/);
});

test("configuração pública não contém service_role", async () => {
  const config = await read("supabase-config.js");
  assert.match(config, /anonKey/);
  assert.doesNotMatch(config, /service[_-]?role\s*:/i);
});

test("rotina de salvamento possui timeout, repetição e bloqueio de duplo clique", async () => {
  const app = await read("app.js");
  assert.match(app, /requestSaveInProgress/);
  assert.match(app, /commitWithRetry\(commitRequestChanges/);
  assert.match(app, /REQUEST_SAVE_TIMEOUT_MS/);
  assert.match(app, /pendingCreateRequestId/);
  assert.match(app, /Tentando novamente/);
});

test("anexos mantêm identificador e são direcionados ao Storage", async () => {
  const [app, compat] = await Promise.all([read("app.js"), read("supabase-compat.js")]);
  assert.match(app, /attachment\.firestoreId/);
  assert.match(app, /doc\(db, "requestAttachments", attachment\.firestoreId\)/);
  assert.match(compat, /request-attachments/);
  assert.match(compat, /storagePath/);
  assert.match(compat, /\.upload\(/);
});

test("service worker publica os módulos do Supabase", async () => {
  const serviceWorker = await read("service-worker.js");
  assert.match(serviceWorker, /\.\/supabase-compat\.js/);
  assert.match(serviceWorker, /\.\/supabase-config\.js/);
  assert.match(serviceWorker, /\.\/save-flow\.js/);
  assert.doesNotMatch(serviceWorker, /firebase-config\.js/);
});

test("workflow testa antes do deploy e não publica arquivos administrativos", async () => {
  const workflow = await read(".github/workflows/pages.yml");
  assert.match(workflow, /actions\/checkout@v5/);
  assert.match(workflow, /actions\/setup-node@v6/);
  assert.match(workflow, /run: npm test/);
  assert.match(workflow, /needs: build/);
  assert.match(workflow, /PUBLIC_FILES=\(/);
  assert.match(workflow, /supabase-config\.js/);
  assert.doesNotMatch(workflow, /cp[^\n]*(migration-report|firebase-service-account|node_modules)/i);
  assert.doesNotMatch(workflow, /rsync -av/);
});


test("migração pode criar usuários ausentes sem expor senha temporária", async () => {
  const common = await readFile(path.join(root, "scripts/migration-common.mjs"), "utf8");
  const packageJson = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
  assert.match(common, /auth\.admin\.createUser/);
  assert.match(common, /randomBytes\(32\)/);
  assert.doesNotMatch(common, /console\.log\([^\n]*temporaryPassword/);
  assert.match(packageJson.scripts["migrate:firebase:create-users"], /--create-missing-users/);
  assert.match(packageJson.scripts["import:backup:create-users"], /--create-missing-users/);
});

test("gravações separam inclusão e atualização para funcionar com RLS", async () => {
  const compat = await read("supabase-compat.js");
  assert.match(compat, /insertOrUpdateRow/);
  assert.match(compat, /\.from\(table\)\.insert\(payload\)/);
  assert.match(compat, /operation === "update"/);
  assert.doesNotMatch(compat, /from\(TABLE_DOCUMENTS\)\.upsert/);
});

test("patch v44 libera inclusão segura para o próprio solicitante e squad", async () => {
  const patch = await read("supabase/fix-request-save-v44.sql");
  assert.match(patch, /can_create_request_payload/);
  assert.match(patch, /safe_uuid\(p_data->>'requesterUid'\) = auth\.uid\(\)/);
  assert.match(patch, /p_data->>'squad'.*current_user_squad/s);
  assert.match(patch, /drop policy if exists documents_insert/);
});


test("patch v45 endurece auditoria, notificações e anexos", async () => {
  const [patch, compat] = await Promise.all([
    read("supabase/security-hardening-v45.sql"),
    read("supabase-compat.js")
  ]);
  assert.match(patch, /can_notify_request_target/i);
  assert.match(patch, /secure_document_insert_fields/i);
  assert.match(patch, /create_request_history/i);
  assert.match(patch, /create_request_notification/i);
  assert.match(patch, /can_edit_request\(request_id\)/i);
  assert.match(patch, /split_part\(name, '\/', 2\)/i);
  assert.match(compat, /rpc\("create_request_history"/);
  assert.match(compat, /rpc\("create_request_notification"/);
});

test("GitHub possui análise CodeQL e atualização de dependências", async () => {
  const [codeql, dependabot] = await Promise.all([
    read(".github/workflows/codeql.yml"),
    read(".github/dependabot.yml")
  ]);
  assert.match(codeql, /github\/codeql-action\/init@v3/);
  assert.match(codeql, /github\/codeql-action\/analyze@v3/);
  assert.match(dependabot, /package-ecosystem: npm/);
  assert.match(dependabot, /package-ecosystem: github-actions/);
});
