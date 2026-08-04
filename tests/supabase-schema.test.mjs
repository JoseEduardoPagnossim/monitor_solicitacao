import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sql = await readFile(path.join(root, "supabase/schema.sql"), "utf8");

test("schema cria tabelas, bucket e índices essenciais", () => {
  for (const fragment of [
    "create table if not exists public.profiles",
    "create table if not exists public.user_invites",
    "create table if not exists public.documents",
    "request-attachments",
    "documents_collection_idx"
  ]) assert.match(sql.toLowerCase(), new RegExp(fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});

test("RLS está habilitado e possui políticas por perfil", () => {
  assert.match(sql, /alter table public\.profiles enable row level security/i);
  assert.match(sql, /alter table public\.documents enable row level security/i);
  assert.match(sql, /current_user_is_admin/i);
  assert.match(sql, /squad_pair_visible/i);
  assert.match(sql, /can_view_request/i);
  assert.match(sql, /documents_select/i);
});

test("convite público é lido por função controlada", () => {
  assert.match(sql, /function public\.get_public_invite/i);
  assert.match(sql, /grant execute on function public\.get_public_invite\(text\) to anon, authenticated/i);
});


test("v58 finaliza cadastro por convite em uma transação controlada", async () => {
  const migration = await readFile(path.join(root, "supabase/invite-onboarding-v58.sql"), "utf8");
  assert.match(sql, /function public\.accept_user_invite\(p_token text\)/i);
  assert.match(migration, /security definer/i);
  assert.match(migration, /from public\.user_invites[\s\S]*for update/i);
  assert.match(migration, /insert into public\.profiles/i);
  assert.match(migration, /update public\.user_invites[\s\S]*'accepted'/i);
  assert.match(migration, /grant execute on function public\.accept_user_invite\(text\) to authenticated/i);
});

test("Storage usa políticas de leitura e gravação", () => {
  assert.match(sql, /attachment_select/i);
  assert.match(sql, /attachment_insert/i);
  assert.match(sql, /attachment_delete/i);
});


test("triggers sincronizam JSON antes de proteger campos privilegiados", () => {
  assert.match(sql, /create trigger a_profiles_sync_columns/i);
  assert.match(sql, /create trigger z_profiles_protect_privileged/i);
  assert.match(sql, /create trigger a_documents_sync_columns/i);
  assert.match(sql, /create trigger z_documents_protect_request_fields/i);
  assert.match(sql, /create trigger a_invites_sync_columns/i);
  assert.match(sql, /create trigger z_invites_protect_fields/i);
});


test("convite não permite escolher perfil ou Squad diferente do autorizado", () => {
  assert.match(sql, /function public\.invite_allows_profile/i);
  assert.match(sql, /coalesce\(i\.data->>'role', 'solicitante'\) = p_role/i);
  assert.match(sql, /coalesce\(i\.data->>'squad', ''\) = p_squad/i);
  assert.match(sql, /lower\(email\) = lower\(auth\.jwt\(\)->>'email'\)/i);
});

test("solicitante cria pedido somente como nova solicitação do próprio Squad", () => {
  assert.match(sql, /function public\.can_create_request_payload/i);
  assert.match(sql, /safe_uuid\(p_data->>'requesterUid'\) = auth\.uid\(\)/i);
  assert.match(sql, /p_data->>'squad'.*public\.current_user_squad\(\)/is);
  assert.match(sql, /p_data->>'status'.*'nova'/is);
  assert.match(sql, /p_data->>'assigneeUid'.*= ''/is);
});

test("v45 protege autoria e destinos de notificação no banco", () => {
  assert.match(sql, /function public\.secure_document_insert_fields/i);
  assert.match(sql, /'actorUid', v_uid::text/i);
  assert.match(sql, /'authorUid', v_uid::text/i);
  assert.match(sql, /function public\.can_notify_request_target/i);
  assert.match(sql, /p_target_uid in \(d\.requester_uid, d\.assignee_uid\)/i);
  assert.match(sql, /function public\.protect_document_updates/i);
});

test("v45 vincula metadados e caminhos de anexos a solicitações editáveis", () => {
  assert.match(sql, /collection_name = 'requestAttachments'[\s\S]*can_edit_request\(request_id\)/i);
  assert.match(sql, /split_part\(name, '\/', 2\)[\s\S]*can_edit_request/i);
});
