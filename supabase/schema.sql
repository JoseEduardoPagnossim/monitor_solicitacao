-- Painel de Solicitações - Supabase
-- Execute este arquivo uma única vez no SQL Editor do Supabase.

begin;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null default '',
  name text not null default '',
  role text not null default 'solicitante' check (role in ('admin', 'solicitante')),
  squad text not null default '' check (squad in ('', 'squad_a', 'squad_b', 'squad_d', 'squad_e')),
  active boolean not null default true,
  access_locked boolean not null default false,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_invites (
  token text primary key,
  email text not null,
  status text not null default 'pending',
  expires_at timestamptz,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  collection_name text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  owner_uid uuid,
  requester_uid uuid,
  assignee_uid uuid,
  target_uid uuid,
  created_by_uid uuid,
  request_id text,
  document_type text,
  squad text,
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection_name, id)
);

create index if not exists documents_collection_idx on public.documents(collection_name);
create index if not exists documents_requester_idx on public.documents(collection_name, requester_uid);
create index if not exists documents_assignee_idx on public.documents(collection_name, assignee_uid);
create index if not exists documents_target_idx on public.documents(collection_name, target_uid);
create index if not exists documents_request_idx on public.documents(collection_name, request_id);
create index if not exists documents_type_squad_idx on public.documents(collection_name, document_type, squad);
create index if not exists documents_status_idx on public.documents(collection_name, status);
create index if not exists profiles_email_idx on public.profiles(lower(email));
create index if not exists invites_email_idx on public.user_invites(lower(email));

create or replace function public.safe_uuid(value text)
returns uuid
language plpgsql
immutable
as $$
begin
  if value is null or btrim(value) = '' then return null; end if;
  return value::uuid;
exception when others then
  return null;
end;
$$;

create or replace function public.sync_profile_columns()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(coalesce(new.data->>'email', new.email, ''));
  new.name := coalesce(new.data->>'name', new.name, '');
  new.role := coalesce(nullif(new.data->>'role', ''), new.role, 'solicitante');
  new.squad := coalesce(new.data->>'squad', new.squad, '');
  new.active := coalesce((new.data->>'active')::boolean, new.active, true);
  new.access_locked := coalesce((new.data->>'accessLocked')::boolean, new.access_locked, false);
  new.updated_at := now();
  new.data := new.data || jsonb_build_object(
    'email', new.email,
    'name', new.name,
    'role', new.role,
    'squad', new.squad,
    'active', new.active,
    'accessLocked', new.access_locked
  );
  return new;
end;
$$;

drop trigger if exists profiles_sync_columns on public.profiles;
drop trigger if exists a_profiles_sync_columns on public.profiles;
create trigger a_profiles_sync_columns
before insert or update on public.profiles
for each row execute function public.sync_profile_columns();

create or replace function public.sync_invite_columns()
returns trigger
language plpgsql
as $$
begin
  new.email := lower(coalesce(new.data->>'email', new.email, ''));
  new.status := coalesce(nullif(new.data->>'status', ''), new.status, 'pending');
  new.expires_at := coalesce((new.data->>'expiresAt')::timestamptz, new.expires_at);
  new.updated_at := now();
  new.data := new.data || jsonb_build_object(
    'email', new.email,
    'status', new.status,
    'expiresAt', case when new.expires_at is null then null else to_jsonb(new.expires_at) end
  );
  return new;
end;
$$;

drop trigger if exists invites_sync_columns on public.user_invites;
drop trigger if exists a_invites_sync_columns on public.user_invites;
create trigger a_invites_sync_columns
before insert or update on public.user_invites
for each row execute function public.sync_invite_columns();

create or replace function public.sync_document_columns()
returns trigger
language plpgsql
as $$
begin
  new.owner_uid := public.safe_uuid(coalesce(new.data->>'ownerUid', new.data->>'uid'));
  new.requester_uid := public.safe_uuid(new.data->>'requesterUid');
  new.assignee_uid := public.safe_uuid(new.data->>'assigneeUid');
  new.target_uid := public.safe_uuid(new.data->>'targetUid');
  new.created_by_uid := public.safe_uuid(coalesce(new.data->>'createdByUid', new.data->>'actorUid', new.data->>'authorUid'));
  new.request_id := coalesce(new.data->>'requestId', new.id);
  new.document_type := new.data->>'type';
  new.squad := new.data->>'squad';
  new.status := new.data->>'status';
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists documents_sync_columns on public.documents;
drop trigger if exists a_documents_sync_columns on public.documents;
create trigger a_documents_sync_columns
before insert or update on public.documents
for each row execute function public.sync_document_columns();

create or replace function public.current_user_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active = true and p.access_locked = false
  );
$$;

create or replace function public.current_user_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active = true and p.access_locked = false and p.role = 'admin'
  );
$$;

create or replace function public.current_user_squad()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.squad from public.profiles p
  where p.id = auth.uid() and p.active = true and p.access_locked = false
  limit 1;
$$;

create or replace function public.squad_pair_visible(target_squad text)
returns boolean
language sql
stable
as $$
  select case
    when public.current_user_squad() in ('squad_a', 'squad_b') then target_squad in ('squad_a', 'squad_b')
    when public.current_user_squad() in ('squad_d', 'squad_e') then target_squad in ('squad_d', 'squad_e')
    else false
  end;
$$;

create or replace function public.can_create_request_payload(p_data jsonb)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_active()
    and public.safe_uuid(p_data->>'requesterUid') = auth.uid()
    and coalesce(p_data->>'squad', '') = public.current_user_squad()
    and coalesce(p_data->>'type', '') in ('programacao', 'cancelamento', 'tef_elgin')
    and coalesce(p_data->>'status', '') = 'nova'
    and coalesce(p_data->>'assigneeUid', '') = '';
$$;

create or replace function public.can_view_request(p_request_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_active() and exists (
    select 1
    from public.documents d
    where d.collection_name = 'requests'
      and d.id = p_request_id
      and (
        public.current_user_is_admin()
        or d.requester_uid = auth.uid()
        or d.assignee_uid = auth.uid()
        or (d.document_type = 'programacao' and public.squad_pair_visible(d.squad))
      )
  );
$$;

create or replace function public.can_edit_request(p_request_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_active() and exists (
    select 1
    from public.documents d
    where d.collection_name = 'requests'
      and d.id = p_request_id
      and (
        public.current_user_is_admin()
        or d.requester_uid = auth.uid()
        or d.assignee_uid = auth.uid()
      )
  );
$$;

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


create or replace function public.has_valid_invite(p_token text, p_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_invites i
    where i.token = p_token
      and lower(i.email) = lower(p_email)
      and i.status = 'pending'
      and (i.expires_at is null or i.expires_at > now())
  );
$$;

create or replace function public.invite_allows_profile(
  p_token text,
  p_email text,
  p_role text,
  p_squad text
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_invites i
    where i.token = p_token
      and lower(i.email) = lower(p_email)
      and i.status = 'pending'
      and (i.expires_at is null or i.expires_at > now())
      and coalesce(i.data->>'role', 'solicitante') = p_role
      and coalesce(i.data->>'squad', '') = p_squad
  );
$$;

create or replace function public.get_public_invite(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select i.data
  from public.user_invites i
  where i.token = p_token
    and i.status = 'pending'
    and (i.expires_at is null or i.expires_at > now())
  limit 1;
$$;

grant execute on function public.get_public_invite(text) to anon, authenticated;

create or replace function public.delete_own_unprofiled_user()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then return; end if;
  if exists (select 1 from public.profiles where id = auth.uid()) then
    raise exception 'profile-already-exists';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

grant execute on function public.delete_own_unprofiled_user() to authenticated;

create or replace function public.protect_invite_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_user_is_admin() then return new; end if;
  if lower(old.email) <> lower(coalesce(auth.jwt()->>'email', '')) then
    raise exception 'permission-denied';
  end if;
  if new.email is distinct from old.email
     or new.expires_at is distinct from old.expires_at
     or new.data->>'name' is distinct from old.data->>'name'
     or new.data->>'role' is distinct from old.data->>'role'
     or new.data->>'squad' is distinct from old.data->>'squad'
     or old.status <> 'pending'
     or new.status <> 'accepted'
     or public.safe_uuid(new.data->>'acceptedUid') is distinct from auth.uid() then
    raise exception 'permission-denied';
  end if;
  return new;
end;
$$;

drop trigger if exists invites_protect_fields on public.user_invites;
drop trigger if exists z_invites_protect_fields on public.user_invites;
create trigger z_invites_protect_fields
before update on public.user_invites
for each row execute function public.protect_invite_fields();

create or replace function public.protect_profile_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or public.current_user_is_admin() then return new; end if;
  if old.id <> auth.uid() then raise exception 'permission-denied'; end if;
  if new.role is distinct from old.role
     or new.squad is distinct from old.squad
     or new.active is distinct from old.active
     or new.access_locked is distinct from old.access_locked
     or new.email is distinct from old.email then
    raise exception 'permission-denied';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_protect_privileged on public.profiles;
drop trigger if exists z_profiles_protect_privileged on public.profiles;
create trigger z_profiles_protect_privileged
before update on public.profiles
for each row execute function public.protect_profile_privileged_fields();

create or replace function public.protect_request_privileged_fields()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.collection_name <> 'requests' or auth.uid() is null or public.current_user_is_admin() then return new; end if;
  if old.requester_uid <> auth.uid() and old.assignee_uid <> auth.uid() then raise exception 'permission-denied'; end if;
  if new.requester_uid is distinct from old.requester_uid
     or new.assignee_uid is distinct from old.assignee_uid
     or new.squad is distinct from old.squad
     or new.document_type is distinct from old.document_type
     or new.status is distinct from old.status
     or new.data->>'createdAt' is distinct from old.data->>'createdAt' then
    raise exception 'permission-denied';
  end if;
  return new;
end;
$$;

drop trigger if exists documents_protect_request_fields on public.documents;
drop trigger if exists z_documents_protect_request_fields on public.documents;
create trigger z_documents_protect_request_fields
before update on public.documents
for each row execute function public.protect_request_privileged_fields();

alter table public.profiles enable row level security;
alter table public.user_invites enable row level security;
alter table public.documents enable row level security;

-- Permissões da API. As políticas RLS continuam decidindo quais linhas podem ser usadas.
grant usage on schema public to anon, authenticated, service_role;
grant select, insert, update, delete on public.profiles to authenticated, service_role;
grant select, insert, update, delete on public.user_invites to authenticated, service_role;
grant select, insert, update, delete on public.documents to authenticated, service_role;

-- Profiles
DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
USING (public.current_user_active() AND (id = auth.uid() OR public.current_user_is_admin()));

DROP POLICY IF EXISTS profiles_insert ON public.profiles;
CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated
WITH CHECK (
  id = auth.uid()
  AND lower(email) = lower(auth.jwt()->>'email')
  AND active = true
  AND access_locked = false
  AND public.invite_allows_profile(
    data->>'inviteToken',
    email,
    role,
    squad
  )
);

DROP POLICY IF EXISTS profiles_update ON public.profiles;
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
USING (public.current_user_active() AND (id = auth.uid() OR public.current_user_is_admin()))
WITH CHECK (public.current_user_active() AND (id = auth.uid() OR public.current_user_is_admin()));

DROP POLICY IF EXISTS profiles_delete ON public.profiles;
CREATE POLICY profiles_delete ON public.profiles FOR DELETE TO authenticated
USING (public.current_user_is_admin() AND id <> auth.uid());

-- Invites
DROP POLICY IF EXISTS invites_select_admin ON public.user_invites;
CREATE POLICY invites_select_admin ON public.user_invites FOR SELECT TO authenticated
USING (public.current_user_is_admin() OR lower(email) = lower(auth.jwt()->>'email'));

DROP POLICY IF EXISTS invites_insert_admin ON public.user_invites;
CREATE POLICY invites_insert_admin ON public.user_invites FOR INSERT TO authenticated
WITH CHECK (public.current_user_is_admin());

DROP POLICY IF EXISTS invites_update ON public.user_invites;
CREATE POLICY invites_update ON public.user_invites FOR UPDATE TO authenticated
USING (public.current_user_is_admin() OR lower(email) = lower(auth.jwt()->>'email'))
WITH CHECK (public.current_user_is_admin() OR lower(email) = lower(auth.jwt()->>'email'));

DROP POLICY IF EXISTS invites_delete_admin ON public.user_invites;
CREATE POLICY invites_delete_admin ON public.user_invites FOR DELETE TO authenticated
USING (public.current_user_is_admin());

-- Documents - leitura
DROP POLICY IF EXISTS documents_select ON public.documents;
CREATE POLICY documents_select ON public.documents FOR SELECT TO authenticated
USING (
  public.current_user_active()
  AND (
    public.current_user_is_admin()
    OR (collection_name = 'requests' AND public.can_view_request(id))
    OR (collection_name IN ('requestComments', 'requestHistory', 'requestAttachments') AND public.can_view_request(request_id))
    OR (collection_name = 'notifications' AND target_uid = auth.uid())
    OR (collection_name = 'savedFilters' AND owner_uid = auth.uid())
    OR collection_name = 'commentTemplates'
  )
);

-- Documents - inclusão
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


-- Documents - atualização
DROP POLICY IF EXISTS documents_update ON public.documents;
CREATE POLICY documents_update ON public.documents FOR UPDATE TO authenticated
USING (
  public.current_user_active()
  AND (
    public.current_user_is_admin()
    OR (collection_name = 'requests' AND public.can_edit_request(id))
    OR (collection_name = 'notifications' AND target_uid = auth.uid())
    OR (collection_name = 'savedFilters' AND owner_uid = auth.uid())
  )
)
WITH CHECK (
  public.current_user_active()
  AND (
    public.current_user_is_admin()
    OR (collection_name = 'requests' AND public.can_edit_request(id))
    OR (collection_name = 'notifications' AND target_uid = auth.uid())
    OR (collection_name = 'savedFilters' AND owner_uid = auth.uid())
  )
);

-- Documents - exclusão
DROP POLICY IF EXISTS documents_delete ON public.documents;
CREATE POLICY documents_delete ON public.documents FOR DELETE TO authenticated
USING (
  public.current_user_active()
  AND (
    public.current_user_is_admin()
    OR (collection_name = 'savedFilters' AND owner_uid = auth.uid())
    OR (collection_name = 'requestAttachments' AND owner_uid = auth.uid() AND public.can_edit_request(request_id))
  )
);

-- Storage privado para anexos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'request-attachments',
  'request-attachments',
  false,
  716800,
  array['image/jpeg', 'image/png', 'text/plain']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create or replace function public.can_view_attachment_path(p_path text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_active() and (
    public.current_user_is_admin()
    or exists (
      select 1 from public.documents d
      where d.collection_name = 'requestAttachments'
        and d.data->>'storagePath' = p_path
        and public.can_view_request(d.request_id)
    )
  );
$$;

DROP POLICY IF EXISTS attachment_select ON storage.objects;
CREATE POLICY attachment_select ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'request-attachments' AND public.can_view_attachment_path(name));

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

-- MFA complementar: contas sem fator verificado usam AAL1; contas com MFA exigem AAL2.
create or replace function public.current_user_mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select auth.uid() is not null
    and (
      not exists (
        select 1
        from auth.mfa_factors f
        where f.user_id = auth.uid()
          and f.status = 'verified'
      )
      or coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
    );
$$;

revoke all on function public.current_user_mfa_satisfied() from public;
grant execute on function public.current_user_mfa_satisfied() to authenticated, service_role;

drop policy if exists profiles_require_verified_mfa on public.profiles;
create policy profiles_require_verified_mfa on public.profiles as restrictive for all to authenticated
using (public.current_user_mfa_satisfied())
with check (public.current_user_mfa_satisfied());

drop policy if exists invites_require_verified_mfa on public.user_invites;
create policy invites_require_verified_mfa on public.user_invites as restrictive for all to authenticated
using (public.current_user_mfa_satisfied())
with check (public.current_user_mfa_satisfied());

drop policy if exists documents_require_verified_mfa on public.documents;
create policy documents_require_verified_mfa on public.documents as restrictive for all to authenticated
using (public.current_user_mfa_satisfied())
with check (public.current_user_mfa_satisfied());

drop policy if exists attachments_require_verified_mfa on storage.objects;
create policy attachments_require_verified_mfa on storage.objects as restrictive for all to authenticated
using (bucket_id <> 'request-attachments' or public.current_user_mfa_satisfied())
with check (bucket_id <> 'request-attachments' or public.current_user_mfa_satisfied());

-- Realtime usado pelas telas abertas do painel.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'documents'
  ) then
    alter publication supabase_realtime add table public.documents;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'profiles'
  ) then
    alter publication supabase_realtime add table public.profiles;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'user_invites'
  ) then
    alter publication supabase_realtime add table public.user_invites;
  end if;
end $$;


-- v47 - aceite obrigatório e versionado do termo de uso
create table if not exists public.legal_documents (
  version text primary key,
  title text not null,
  effective_date date not null,
  document_hash text not null check (document_hash ~ '^[0-9a-f]{64}$'),
  content_path text not null,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.legal_acceptances (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_version text not null references public.legal_documents(version),
  document_hash text not null,
  accepted_at timestamptz not null default now(),
  email_snapshot text not null default '',
  name_snapshot text not null default '',
  role_snapshot text not null default '',
  squad_snapshot text not null default '',
  user_agent text not null default '',
  ip_address text not null default '',
  acceptance_source text not null default 'web',
  created_at timestamptz not null default now(),
  unique (user_id, document_version)
);

create index if not exists legal_acceptances_user_idx
  on public.legal_acceptances(user_id, accepted_at desc);

create index if not exists legal_documents_active_idx
  on public.legal_documents(active, effective_date desc);

alter table public.legal_documents enable row level security;
alter table public.legal_acceptances enable row level security;

-- A versão ativa deve ser única.
create unique index if not exists legal_documents_single_active_idx
  on public.legal_documents ((active))
  where active = true;

update public.legal_documents set active = false where active = true;

insert into public.legal_documents (
  version,
  title,
  effective_date,
  document_hash,
  content_path,
  active,
  updated_at
)
values (
  '2026-07-31-v1',
  'Política de Uso, Confidencialidade e Proteção de Dados',
  date '2026-07-31',
  '4204ae4448516f145f883b17e178b2245919c9e121e87643a21fa14ec57dff4d',
  'legal/termo-uso-confidencialidade-v1.html',
  true,
  now()
)
on conflict (version) do update set
  title = excluded.title,
  effective_date = excluded.effective_date,
  document_hash = excluded.document_hash,
  content_path = excluded.content_path,
  active = true,
  updated_at = now();

create or replace function public.has_accepted_current_terms()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
    and exists (
      select 1
      from public.legal_documents d
      join public.legal_acceptances a
        on a.document_version = d.version
       and a.document_hash = d.document_hash
      where d.active = true
        and a.user_id = auth.uid()
    );
$$;

revoke all on function public.has_accepted_current_terms() from public;
grant execute on function public.has_accepted_current_terms() to authenticated, service_role;

create or replace function public.get_current_legal_status()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select jsonb_build_object(
        'version', d.version,
        'title', d.title,
        'effectiveDate', d.effective_date,
        'documentHash', d.document_hash,
        'contentPath', d.content_path,
        'accepted', exists (
          select 1
          from public.legal_acceptances a
          where a.user_id = auth.uid()
            and a.document_version = d.version
            and a.document_hash = d.document_hash
        ),
        'acceptedAt', (
          select a.accepted_at
          from public.legal_acceptances a
          where a.user_id = auth.uid()
            and a.document_version = d.version
            and a.document_hash = d.document_hash
          order by a.accepted_at desc
          limit 1
        )
      )
      from public.legal_documents d
      where d.active = true
      order by d.effective_date desc
      limit 1
    ),
    jsonb_build_object('accepted', false, 'missingDocument', true)
  );
$$;

revoke all on function public.get_current_legal_status() from public;
grant execute on function public.get_current_legal_status() to authenticated, service_role;

create or replace function public.accept_current_legal_terms(
  p_version text,
  p_document_hash text,
  p_user_agent text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_document public.legal_documents%rowtype;
  v_profile public.profiles%rowtype;
  v_headers jsonb := '{}'::jsonb;
  v_ip text := '';
  v_accepted_at timestamptz;
  v_acceptance_id uuid;
begin
  if v_uid is null then
    raise exception 'authentication-required';
  end if;

  if not public.current_user_active() then
    raise exception 'permission-denied';
  end if;

  if not public.current_user_mfa_satisfied() then
    raise exception 'mfa-required';
  end if;

  select * into v_document
  from public.legal_documents
  where active = true
  order by effective_date desc
  limit 1;

  if not found then
    raise exception 'legal-document-not-configured';
  end if;

  if coalesce(p_version, '') <> v_document.version
     or lower(coalesce(p_document_hash, '')) <> lower(v_document.document_hash) then
    raise exception 'legal-document-outdated';
  end if;

  select * into v_profile
  from public.profiles
  where id = v_uid
    and active = true
    and access_locked = false;

  if not found then
    raise exception 'profile-not-found';
  end if;

  begin
    v_headers := coalesce(nullif(current_setting('request.headers', true), ''), '{}')::jsonb;
  exception when others then
    v_headers := '{}'::jsonb;
  end;

  v_ip := btrim(split_part(coalesce(
    nullif(v_headers->>'x-forwarded-for', ''),
    nullif(v_headers->>'cf-connecting-ip', ''),
    nullif(v_headers->>'x-real-ip', ''),
    ''
  ), ',', 1));

  insert into public.legal_acceptances (
    user_id,
    document_version,
    document_hash,
    email_snapshot,
    name_snapshot,
    role_snapshot,
    squad_snapshot,
    user_agent,
    ip_address,
    acceptance_source
  )
  values (
    v_uid,
    v_document.version,
    v_document.document_hash,
    coalesce(v_profile.email, ''),
    coalesce(v_profile.name, ''),
    coalesce(v_profile.role, ''),
    coalesce(v_profile.squad, ''),
    left(coalesce(p_user_agent, ''), 500),
    left(coalesce(v_ip, ''), 120),
    'web'
  )
  on conflict (user_id, document_version) do nothing;

  select id, accepted_at
    into v_acceptance_id, v_accepted_at
  from public.legal_acceptances
  where user_id = v_uid
    and document_version = v_document.version
    and document_hash = v_document.document_hash
  order by accepted_at desc
  limit 1;

  update public.profiles
  set data = data || jsonb_build_object(
    'termsAcceptedVersion', v_document.version,
    'termsAcceptedHash', v_document.document_hash,
    'termsAcceptedAt', v_accepted_at,
    'termsAcceptanceId', v_acceptance_id::text
  )
  where id = v_uid;

  insert into public.documents (
    collection_name,
    id,
    data,
    owner_uid,
    created_by_uid,
    created_at,
    updated_at
  )
  values (
    'accessLogs',
    gen_random_uuid()::text,
    jsonb_build_object(
      'eventType', 'legal_terms_accepted',
      'description', 'Aceite da Política de Uso, Confidencialidade e Proteção de Dados.',
      'documentVersion', v_document.version,
      'documentHash', v_document.document_hash,
      'userUid', v_uid::text,
      'userName', coalesce(v_profile.name, ''),
      'userEmail', coalesce(v_profile.email, ''),
      'userAgent', left(coalesce(p_user_agent, ''), 500),
      'createdAt', v_accepted_at
    ),
    v_uid,
    v_uid,
    v_accepted_at,
    v_accepted_at
  );

  return jsonb_build_object(
    'accepted', true,
    'version', v_document.version,
    'documentHash', v_document.document_hash,
    'acceptedAt', v_accepted_at,
    'acceptanceId', v_acceptance_id
  );
end;
$$;

revoke all on function public.accept_current_legal_terms(text, text, text) from public;
grant execute on function public.accept_current_legal_terms(text, text, text) to authenticated, service_role;

-- O usuário pode consultar o próprio comprovante; administradores podem auditar todos.
drop policy if exists legal_documents_select_active on public.legal_documents;
create policy legal_documents_select_active
on public.legal_documents
for select
to authenticated
using (active = true or public.current_user_is_admin());

drop policy if exists legal_acceptances_select on public.legal_acceptances;
create policy legal_acceptances_select
on public.legal_acceptances
for select
to authenticated
using (
  user_id = auth.uid()
  or (public.current_user_is_admin() and public.has_accepted_current_terms())
);

revoke insert, update, delete on public.legal_documents from anon, authenticated;
revoke insert, update, delete on public.legal_acceptances from anon, authenticated;
grant select on public.legal_documents to authenticated;
grant select on public.legal_acceptances to authenticated;

-- Antes do aceite, somente o próprio perfil permanece legível para validar a conta.
drop policy if exists profiles_require_terms_for_other_users on public.profiles;
create policy profiles_require_terms_for_other_users
on public.profiles
as restrictive
for select
to authenticated
using (id = auth.uid() or public.has_accepted_current_terms());

-- Nenhum dado operacional ou anexo pode ser acessado sem o aceite da versão vigente.
drop policy if exists documents_require_current_terms on public.documents;
create policy documents_require_current_terms
on public.documents
as restrictive
for all
to authenticated
using (public.has_accepted_current_terms())
with check (public.has_accepted_current_terms());

drop policy if exists attachments_require_current_terms on storage.objects;
create policy attachments_require_current_terms
on storage.objects
as restrictive
for all
to authenticated
using (
  bucket_id <> 'request-attachments'
  or public.has_accepted_current_terms()
)
with check (
  bucket_id <> 'request-attachments'
  or public.has_accepted_current_terms()
);

commit;
