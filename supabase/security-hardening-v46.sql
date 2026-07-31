-- Painel de Solicitações v46
-- Segurança complementar: exigência de AAL2 para contas com MFA verificado
-- e limites explícitos para o bucket privado de anexos.
-- Execute uma vez no SQL Editor após o security-hardening-v45.sql.

begin;

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

-- Políticas restritivas são combinadas com as políticas funcionais existentes.
-- Usuários sem MFA continuam em AAL1; quem ativar MFA precisa concluir AAL2.
drop policy if exists profiles_require_verified_mfa on public.profiles;
create policy profiles_require_verified_mfa
on public.profiles
as restrictive
for all
to authenticated
using (public.current_user_mfa_satisfied())
with check (public.current_user_mfa_satisfied());

drop policy if exists invites_require_verified_mfa on public.user_invites;
create policy invites_require_verified_mfa
on public.user_invites
as restrictive
for all
to authenticated
using (public.current_user_mfa_satisfied())
with check (public.current_user_mfa_satisfied());

drop policy if exists documents_require_verified_mfa on public.documents;
create policy documents_require_verified_mfa
on public.documents
as restrictive
for all
to authenticated
using (public.current_user_mfa_satisfied())
with check (public.current_user_mfa_satisfied());

drop policy if exists attachments_require_verified_mfa on storage.objects;
create policy attachments_require_verified_mfa
on storage.objects
as restrictive
for all
to authenticated
using (
  bucket_id <> 'request-attachments'
  or public.current_user_mfa_satisfied()
)
with check (
  bucket_id <> 'request-attachments'
  or public.current_user_mfa_satisfied()
);

update storage.buckets
set public = false,
    file_size_limit = 716800,
    allowed_mime_types = array['image/jpeg', 'image/png', 'text/plain']::text[]
where id = 'request-attachments';

commit;
