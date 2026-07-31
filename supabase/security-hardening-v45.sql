-- Painel de Solicitações v45
-- Endurecimento urgente de segurança: autoria confiável, notificações,
-- metadados de anexos e caminhos do Storage.
-- Execute uma vez no SQL Editor do Supabase após publicar os arquivos da v45.

begin;

create or replace function public.can_notify_request_target(
  p_request_id text,
  p_target_uid uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and public.current_user_active()
    and p_target_uid is not null
    and public.can_edit_request(p_request_id)
    and exists (
      select 1
      from public.documents d
      where d.collection_name = 'requests'
        and d.id = p_request_id
        and p_target_uid in (d.requester_uid, d.assignee_uid)
    );
$$;

revoke all on function public.can_notify_request_target(text, uuid) from public;
grant execute on function public.can_notify_request_target(text, uuid) to authenticated, service_role;

create or replace function public.secure_document_insert_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := '';
  v_email text := '';
  v_mention_uid uuid;
begin
  -- Importações administrativas com service_role não possuem auth.uid().
  if v_uid is null then
    return new;
  end if;

  select p.name, p.email
    into v_name, v_email
  from public.profiles p
  where p.id = v_uid
    and p.active = true
    and p.access_locked = false;

  if not found then
    raise exception 'permission-denied';
  end if;

  if new.collection_name = 'requestAttachments' then
    new.data := new.data || jsonb_build_object(
      'ownerUid', v_uid::text,
      'createdByUid', v_uid::text
    );
    new.owner_uid := v_uid;
    new.created_by_uid := v_uid;

  elsif new.collection_name = 'requestComments' then
    v_mention_uid := public.safe_uuid(new.data->>'mentionUid');
    if v_mention_uid is not null
       and not public.can_notify_request_target(new.request_id, v_mention_uid) then
      raise exception 'invalid-notification-target';
    end if;

    new.data := new.data || jsonb_build_object(
      'authorUid', v_uid::text,
      'authorName', coalesce(nullif(v_name, ''), v_email, 'Usuário'),
      'authorEmail', coalesce(v_email, '')
    );
    new.created_by_uid := v_uid;

  elsif new.collection_name = 'requestHistory' then
    new.data := new.data || jsonb_build_object(
      'actorUid', v_uid::text,
      'actorName', coalesce(nullif(v_name, ''), v_email, 'Usuário'),
      'actorEmail', coalesce(v_email, '')
    );
    new.created_by_uid := v_uid;

  elsif new.collection_name = 'notifications' then
    new.data := new.data || jsonb_build_object(
      'createdByUid', v_uid::text,
      'createdByName', coalesce(nullif(v_name, ''), v_email, 'Usuário')
    );
    new.created_by_uid := v_uid;

  elsif new.collection_name = 'savedFilters' then
    new.data := new.data || jsonb_build_object('ownerUid', v_uid::text);
    new.owner_uid := v_uid;

  elsif new.collection_name = 'accessLogs' then
    new.data := new.data || jsonb_build_object(
      'uid', v_uid::text,
      'name', coalesce(nullif(v_name, ''), v_email, 'Usuário'),
      'email', coalesce(v_email, '')
    );
    new.owner_uid := v_uid;
    new.created_by_uid := v_uid;
  end if;

  return new;
end;
$$;

revoke all on function public.secure_document_insert_fields() from public;

drop trigger if exists z_documents_secure_insert_fields on public.documents;
create trigger z_documents_secure_insert_fields
before insert on public.documents
for each row execute function public.secure_document_insert_fields();

create or replace function public.protect_document_updates()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_user_is_admin() then
    return new;
  end if;

  if old.collection_name = 'notifications' then
    if old.target_uid is distinct from auth.uid()
       or new.collection_name is distinct from old.collection_name
       or new.id is distinct from old.id
       or new.target_uid is distinct from old.target_uid
       or new.request_id is distinct from old.request_id
       or new.created_by_uid is distinct from old.created_by_uid
       or (new.data - array['read', 'readAt'])
          is distinct from (old.data - array['read', 'readAt']) then
      raise exception 'permission-denied';
    end if;
  end if;

  if old.collection_name = 'savedFilters'
     and new.owner_uid is distinct from old.owner_uid then
    raise exception 'permission-denied';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_document_updates() from public;

drop trigger if exists zz_documents_protect_updates on public.documents;
create trigger zz_documents_protect_updates
before update on public.documents
for each row execute function public.protect_document_updates();

create or replace function public.create_request_history(
  p_id text,
  p_request_id text,
  p_request_title text,
  p_request_type text,
  p_action text,
  p_summary text,
  p_details jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := '';
  v_email text := '';
begin
  if v_uid is null or not public.can_edit_request(p_request_id) then
    raise exception 'permission-denied';
  end if;

  select p.name, p.email into v_name, v_email
  from public.profiles p where p.id = v_uid;

  insert into public.documents (collection_name, id, data)
  values (
    'requestHistory',
    left(coalesce(nullif(p_id, ''), gen_random_uuid()::text), 160),
    jsonb_build_object(
      'requestId', left(coalesce(p_request_id, ''), 160),
      'requestTitle', left(coalesce(p_request_title, ''), 140),
      'requestType', left(coalesce(p_request_type, 'programacao'), 40),
      'action', case
        when coalesce(p_action, '') ~ '^[a-z0-9_-]{1,40}$' then p_action
        else 'update'
      end,
      'summary', left(coalesce(p_summary, ''), 500),
      'details', coalesce(p_details, '{}'::jsonb),
      'actorUid', v_uid::text,
      'actorName', coalesce(nullif(v_name, ''), v_email, 'Usuário'),
      'actorEmail', coalesce(v_email, ''),
      'createdAt', now()
    )
  )
  on conflict (collection_name, id) do nothing;
end;
$$;

revoke all on function public.create_request_history(text, text, text, text, text, text, jsonb) from public;
grant execute on function public.create_request_history(text, text, text, text, text, text, jsonb) to authenticated;

create or replace function public.create_request_notification(
  p_id text,
  p_request_id text,
  p_target_uid uuid,
  p_request_title text,
  p_message text,
  p_type text default 'system'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_creator_name text := '';
  v_creator_email text := '';
  v_target_name text := '';
  v_target_email text := '';
begin
  if v_uid is null
     or not public.can_notify_request_target(p_request_id, p_target_uid) then
    raise exception 'permission-denied';
  end if;

  select p.name, p.email into v_creator_name, v_creator_email
  from public.profiles p where p.id = v_uid;

  select p.name, p.email into v_target_name, v_target_email
  from public.profiles p
  where p.id = p_target_uid and p.active = true and p.access_locked = false;

  if not found then
    raise exception 'invalid-notification-target';
  end if;

  insert into public.documents (collection_name, id, data)
  values (
    'notifications',
    left(coalesce(nullif(p_id, ''), gen_random_uuid()::text), 160),
    jsonb_build_object(
      'targetUid', p_target_uid::text,
      'targetName', coalesce(nullif(v_target_name, ''), v_target_email, 'Usuário'),
      'createdByUid', v_uid::text,
      'createdByName', coalesce(nullif(v_creator_name, ''), v_creator_email, 'Usuário'),
      'requestId', left(coalesce(p_request_id, ''), 160),
      'requestTitle', left(coalesce(p_request_title, ''), 140),
      'message', left(coalesce(p_message, ''), 300),
      'type', case
        when coalesce(p_type, '') in ('mention', 'assignment', 'blocked', 'status', 'paused_24h', 'system') then p_type
        else 'system'
      end,
      'read', false,
      'createdAt', now(),
      'readAt', null
    )
  )
  on conflict (collection_name, id) do nothing;
end;
$$;

revoke all on function public.create_request_notification(text, text, uuid, text, text, text) from public;
grant execute on function public.create_request_notification(text, text, uuid, text, text, text) to authenticated;

-- Inclusões diretas: dados de auditoria e notificação são protegidos pelo trigger/RPC.
drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
with check (
  public.current_user_active()
  and (
    public.current_user_is_admin()
    or (
      collection_name = 'requests'
      and public.can_create_request_payload(data)
    )
    or (
      collection_name = 'requestAttachments'
      and owner_uid = auth.uid()
      and created_by_uid = auth.uid()
      and public.can_edit_request(request_id)
    )
    or (
      collection_name = 'requestComments'
      and created_by_uid = auth.uid()
      and public.can_edit_request(request_id)
    )
    or (
      collection_name = 'requestHistory'
      and created_by_uid = auth.uid()
      and public.can_edit_request(request_id)
    )
    or (
      collection_name = 'notifications'
      and created_by_uid = auth.uid()
      and public.can_notify_request_target(request_id, target_uid)
    )
    or (collection_name = 'savedFilters' and owner_uid = auth.uid())
    or (collection_name = 'accessLogs' and owner_uid = auth.uid())
  )
);

-- O segundo segmento do caminho é obrigatoriamente o ID da solicitação.
drop policy if exists attachment_insert on storage.objects;
create policy attachment_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'request-attachments'
  and public.current_user_active()
  and (
    public.current_user_is_admin()
    or (
      split_part(name, '/', 1) = auth.uid()::text
      and public.can_edit_request(split_part(name, '/', 2))
    )
  )
);

drop policy if exists attachment_update on storage.objects;
create policy attachment_update on storage.objects for update to authenticated
using (
  bucket_id = 'request-attachments'
  and public.current_user_active()
  and (
    public.current_user_is_admin()
    or (
      split_part(name, '/', 1) = auth.uid()::text
      and public.can_edit_request(split_part(name, '/', 2))
    )
  )
)
with check (
  bucket_id = 'request-attachments'
  and public.current_user_active()
  and (
    public.current_user_is_admin()
    or (
      split_part(name, '/', 1) = auth.uid()::text
      and public.can_edit_request(split_part(name, '/', 2))
    )
  )
);

drop policy if exists attachment_delete on storage.objects;
create policy attachment_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'request-attachments'
  and public.current_user_active()
  and (
    public.current_user_is_admin()
    or (
      split_part(name, '/', 1) = auth.uid()::text
      and public.can_edit_request(split_part(name, '/', 2))
    )
  )
);

commit;
