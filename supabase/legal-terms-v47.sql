-- Painel de Solicitações v47
-- Aceite obrigatório e versionado da Política de Uso, Confidencialidade e Proteção de Dados.
-- Execute uma vez no SQL Editor depois do security-hardening-v46.sql.

begin;

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
