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
DROP POLICY IF EXISTS documents_insert ON public.documents;
CREATE POLICY documents_insert ON public.documents FOR INSERT TO authenticated
WITH CHECK (
  public.current_user_active()
  AND (
    public.current_user_is_admin()
    OR (
      collection_name = 'requests'
      AND public.can_create_request_payload(data)
    )
    OR (
      collection_name = 'requestAttachments'
      AND public.safe_uuid(data->>'ownerUid') = auth.uid()
    )
    OR (collection_name IN ('requestComments', 'requestHistory') AND public.can_edit_request(request_id))
    OR (collection_name = 'notifications' AND created_by_uid = auth.uid())
    OR (collection_name = 'savedFilters' AND owner_uid = auth.uid())
    OR (collection_name = 'accessLogs' AND owner_uid = auth.uid())
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
  734003,
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

DROP POLICY IF EXISTS attachment_insert ON storage.objects;
CREATE POLICY attachment_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'request-attachments'
  AND public.current_user_active()
  AND (public.current_user_is_admin() OR split_part(name, '/', 1) = auth.uid()::text)
);

DROP POLICY IF EXISTS attachment_update ON storage.objects;
CREATE POLICY attachment_update ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'request-attachments'
  AND public.current_user_active()
  AND (public.current_user_is_admin() OR split_part(name, '/', 1) = auth.uid()::text)
)
WITH CHECK (
  bucket_id = 'request-attachments'
  AND public.current_user_active()
  AND (public.current_user_is_admin() OR split_part(name, '/', 1) = auth.uid()::text)
);

DROP POLICY IF EXISTS attachment_delete ON storage.objects;
CREATE POLICY attachment_delete ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'request-attachments'
  AND public.current_user_active()
  AND (public.current_user_is_admin() OR split_part(name, '/', 1) = auth.uid()::text)
);

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

commit;
