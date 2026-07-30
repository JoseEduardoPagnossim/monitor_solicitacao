import test from "node:test";
import assert from "node:assert/strict";
import {
  createMissingSupabaseAuthUsers,
  buildUidMap,
  replaceUidFields
} from "../scripts/migration-common.mjs";

test("modo de teste lista usuários ausentes sem criá-los", async () => {
  let calls = 0;
  const supabase = {
    auth: { admin: { createUser: async () => { calls += 1; return {}; } } }
  };
  const source = [{ id: "firebase-1", data: { email: "usuario@empresa.com", name: "Usuário" } }];
  const result = await createMissingSupabaseAuthUsers(supabase, source, [], { enabled: true, dryRun: true });
  assert.equal(calls, 0);
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.created.length, 0);
});

test("migração cria usuário ausente com e-mail confirmado e senha aleatória", async () => {
  const payloads = [];
  const supabase = {
    auth: {
      admin: {
        createUser: async (payload) => {
          payloads.push(payload);
          return { data: { user: { id: "supabase-1" } }, error: null };
        }
      }
    }
  };
  const source = [{ id: "firebase-1", data: { email: "Usuario@Empresa.com", name: "Usuário" } }];
  const result = await createMissingSupabaseAuthUsers(supabase, source, [], { enabled: true, dryRun: false });
  assert.equal(payloads.length, 1);
  assert.equal(payloads[0].email, "usuario@empresa.com");
  assert.equal(payloads[0].email_confirm, true);
  assert.ok(payloads[0].password.length >= 32);
  assert.equal(result.created[0].email, "usuario@empresa.com");
  assert.equal("password" in result.created[0], false);
});

test("UIDs antigos são associados por e-mail e substituídos nos dados", () => {
  const source = [{ id: "firebase-1", data: { email: "usuario@empresa.com" } }];
  const { uidMap, missing } = buildUidMap(source, [{ id: "supabase-1", email: "usuario@empresa.com" }]);
  assert.equal(missing.length, 0);
  assert.equal(uidMap.get("firebase-1"), "supabase-1");
  assert.deepEqual(
    replaceUidFields({ requesterUid: "firebase-1", nested: { authorUid: "firebase-1" } }, uidMap),
    { requesterUid: "supabase-1", nested: { authorUid: "supabase-1" } }
  );
});
