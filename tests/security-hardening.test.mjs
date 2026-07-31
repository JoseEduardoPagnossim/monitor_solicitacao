import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");

async function walk(directory, relative = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if ([".git", "node_modules", "_site"].includes(entry.name)) continue;
    const childRelative = path.join(relative, entry.name);
    const child = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(child, childRelative));
    else files.push(childRelative.replaceAll("\\", "/"));
  }
  return files;
}

test("configuração pública usa somente chave publishable", async () => {
  const config = await read("supabase-config.js");
  assert.match(config, /https:\/\/[a-z0-9-]+\.supabase\.co/i);
  assert.match(config, /sb_publishable_[A-Za-z0-9_-]+/);
  assert.doesNotMatch(config, /sb_secret_[A-Za-z0-9_-]+/);
  assert.doesNotMatch(config, /service[_-]?role\s*[:=]/i);
});

test("repositório não contém arquivos privados conhecidos", async () => {
  const files = await walk(root);
  for (const forbidden of [
    /^migration-report.*\.json$/i,
    /firebase.*service.*account.*\.json$/i,
    /serviceAccount.*\.json$/i,
    /^\.env(?:\.|$)/i,
    /painel-solicitacoes-backup-.*\.json$/i
  ]) {
    assert.equal(files.some((file) => forbidden.test(path.basename(file))), false, `Arquivo proibido encontrado: ${forbidden}`);
  }
});

test("repositório não contém padrões de credenciais privadas", async () => {
  const files = (await walk(root)).filter((file) => !/\.(png|jpg|jpeg|gif|ico|zip|lock)$/i.test(file));
  const combined = (await Promise.all(files.map(async (file) => {
    try { return await read(file); } catch { return ""; }
  }))).join("\n");

  assert.doesNotMatch(combined, /sb_secret_[A-Za-z0-9_-]{16,}/);
  assert.doesNotMatch(combined, /xkeysib-[A-Za-z0-9_-]{20,}/);
  assert.doesNotMatch(combined, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/);
  assert.doesNotMatch(combined, /"private_key"\s*:\s*"-----BEGIN/);
});

test("HTML possui CSP e não usa eventos JavaScript inline", async () => {
  const [html, app] = await Promise.all([read("index.html"), read("app.js")]);
  assert.match(html, /http-equiv="Content-Security-Policy"/i);
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/i)?.[1] || "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /script-src 'self' https:\/\/cdn\.jsdelivr\.net/);
  assert.doesNotMatch(csp.match(/script-src[^;]+/)?.[0] || "", /unsafe-inline/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i);
  assert.doesNotMatch(app, /onclick\s*=/i);
});

test("URLs externas de anexos são normalizadas antes de renderizar", async () => {
  const app = await read("app.js");
  assert.match(app, /const safeExternalUrl = normalizeUrl\(attachment\.url\)/);
  assert.doesNotMatch(app, /href="\$\{escapeHtml\(attachment\.url\)\}"/);
});

test("solicitação é gravada antes dos anexos protegidos por requestId", async () => {
  const app = await read("app.js");
  const block = app.match(/const commitRequestChanges = async \(\) => \{([\s\S]*?)return batch\.commit\(\);/)?.[1] || "";
  const requestPosition = block.indexOf("batch.set(requestDocument");
  const attachmentPosition = block.indexOf("pendingAttachmentWrites.forEach");
  assert.ok(requestPosition >= 0, "gravação da solicitação não encontrada");
  assert.ok(attachmentPosition > requestPosition, "anexos devem ser gravados depois da solicitação");
});
