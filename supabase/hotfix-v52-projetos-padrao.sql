-- Hotfix v52 - garante a identidade dos projetos padrão.
-- Execute no SQL Editor do Supabase uma única vez.

begin;

alter table public.documents
  disable trigger zzz_v48_secure_projects_and_requests;

update public.documents
set data = data || jsonb_build_object(
      'id', id,
      'name', case id
        when 'programacao' then 'Programação'
        when 'cancelamento' then 'Cancelamento'
        when 'tef_elgin' then 'TEF Elgin'
      end,
      'legacyType', id,
      'active', true,
      'status', 'published',
      'updatedAt', now()
    ),
    updated_at = now()
where collection_name = 'requestProjects'
  and id in ('programacao', 'cancelamento', 'tef_elgin');

alter table public.documents
  enable trigger zzz_v48_secure_projects_and_requests;

commit;

select
  id,
  data->>'name' as name,
  data->>'legacyType' as legacy_type,
  data->>'status' as status,
  data->>'active' as active
from public.documents
where collection_name = 'requestProjects'
  and id in ('programacao', 'cancelamento', 'tef_elgin')
order by id;
