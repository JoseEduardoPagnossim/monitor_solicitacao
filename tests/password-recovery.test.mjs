import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => readFile(path.join(root, name), "utf8");

test("evento PASSWORD_RECOVERY chega à aplicação mesmo com sessão já detectada", async () => {
  const compat = await read("supabase-compat.js");
  assert.match(compat, /event === "PASSWORD_RECOVERY"/);
  assert.match(compat, /callback\(user, event\)/);
  assert.match(compat, /deliver\(mapUser\(session\?\.user \|\| null\), event\)/);
});

test("link de recuperação abre formulário específico de nova senha", async () => {
  const app = await read("app.js");
  assert.match(app, /authEvent === "PASSWORD_RECOVERY"/);
  assert.match(app, /openPasswordDialog\(true\)/);
  assert.match(app, /currentPasswordField\.hidden = state\.passwordRecoveryMode/);
  assert.match(app, /currentPassword\.required = !state\.passwordRecoveryMode/);
});

test("recuperação atualiza a senha sem exigir a senha anterior", async () => {
  const app = await read("app.js");
  assert.match(app, /if \(!recoveryMode\) \{[\s\S]*reauthenticateWithCredential/);
  assert.match(app, /await updatePassword\(auth\.currentUser, newPassword\)/);
  assert.match(app, /Senha redefinida com sucesso\. Entre novamente usando a nova senha\./);
});

test("diálogo obrigatório de recuperação não fecha pelo fundo ou Esc", async () => {
  const app = await read("app.js");
  assert.match(app, /dialog\.dataset\.recoveryMode !== "true"/);
  assert.match(app, /if \(state\.passwordRecoveryMode\) event\.preventDefault\(\)/);
});
