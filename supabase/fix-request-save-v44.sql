-- Painel de Solicitações v44
-- Correção de gravação para usuários solicitantes migrados do Firebase.
-- Execute no SQL Editor do Supabase e clique em Run.

begin;

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

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
with check (
  public.current_user_active()
  and (
    public.current_user_is_admin()
    or (collection_name = 'requests' and public.can_create_request_payload(data))
    or (collection_name = 'requestAttachments' and public.safe_uuid(data->>'ownerUid') = auth.uid())
    or (collection_name in ('requestComments', 'requestHistory') and public.can_edit_request(request_id))
    or (collection_name = 'notifications' and created_by_uid = auth.uid())
    or (collection_name = 'savedFilters' and owner_uid = auth.uid())
    or (collection_name = 'accessLogs' and owner_uid = auth.uid())
  )
);

commit;
