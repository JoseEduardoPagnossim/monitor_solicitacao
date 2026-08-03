-- Hotfix v53 - corrige de forma definitiva a identidade dos projetos nativos.
-- Execute no SQL Editor do Supabase depois de publicar a versão 53.
-- O script é idempotente e pode ser executado novamente.

begin;

alter table public.documents
  disable trigger zzz_v48_secure_projects_and_requests;

-- Garante que os três documentos oficiais existam e possuam a definição nativa.
insert into public.documents (collection_name, id, data)
values
  ('requestProjects', 'programacao', jsonb_build_object(
    'id','programacao','name','Programação','description','Solicitações de programação e melhoria do sistema.',
    'audience','all','status','published','active',true,'legacyType','programacao','order',10,
    'standardFields','{}'::jsonb,'customFields','[]'::jsonb,'updatedAt',now()
  )),
  ('requestProjects', 'cancelamento', jsonb_build_object(
    'id','cancelamento','name','Cancelamento','description','Chamados de cancelamento de clientes.',
    'audience','all','status','published','active',true,'legacyType','cancelamento','order',20,
    'standardFields','{}'::jsonb,'customFields','[]'::jsonb,'updatedAt',now()
  )),
  ('requestProjects', 'tef_elgin', jsonb_build_object(
    'id','tef_elgin','name','TEF Elgin','description','Solicitações de implantação e configuração de TEF Elgin.',
    'audience','all','status','published','active',true,'legacyType','tef_elgin','order',30,
    'standardFields','{}'::jsonb,'customFields','[]'::jsonb,'updatedAt',now()
  ))
on conflict (collection_name, id) do update
set data = public.documents.data || excluded.data,
    updated_at = now();

-- Localiza projetos duplicados que receberam o nome ou o tipo de um projeto nativo.
create temporary table v53_project_aliases on commit drop as
select
  id as old_id,
  case
    when lower(coalesce(data->>'legacyType', '')) = 'programacao'
      or lower(coalesce(data->>'name', '')) in ('programação', 'programacao') then 'programacao'
    when lower(coalesce(data->>'legacyType', '')) = 'cancelamento'
      or lower(coalesce(data->>'name', '')) = 'cancelamento' then 'cancelamento'
    when lower(coalesce(data->>'legacyType', '')) = 'tef_elgin'
      or lower(coalesce(data->>'name', '')) in ('tef elgin', 'tef_elgin') then 'tef_elgin'
  end as canonical_id
from public.documents
where collection_name = 'requestProjects'
  and id not in ('programacao', 'cancelamento', 'tef_elgin')
  and (
    lower(coalesce(data->>'legacyType', '')) in ('programacao', 'cancelamento', 'tef_elgin')
    or lower(coalesce(data->>'name', '')) in ('programação', 'programacao', 'cancelamento', 'tef elgin', 'tef_elgin')
  );

-- Reassocia solicitações antigas que apontavam para uma duplicata.
update public.documents as request_document
set data = request_document.data || jsonb_build_object(
      'projectId', alias.canonical_id,
      'type', alias.canonical_id,
      'projectName', case alias.canonical_id
        when 'programacao' then 'Programação'
        when 'cancelamento' then 'Cancelamento'
        when 'tef_elgin' then 'TEF Elgin'
      end,
      'updatedAt', now()
    ),
    updated_at = now()
from v53_project_aliases as alias
where request_document.collection_name in ('requests', 'archivedRequests')
  and coalesce(request_document.data->>'projectId', request_document.data->>'type') = alias.old_id;

-- Arquiva as duplicatas para que não voltem a aparecer na criação de solicitações.
update public.documents as project_document
set data = project_document.data || jsonb_build_object(
      'status', 'archived',
      'active', false,
      'legacyType', 'custom',
      'updatedAt', now()
    ),
    updated_at = now()
from v53_project_aliases as alias
where project_document.collection_name = 'requestProjects'
  and project_document.id = alias.old_id;

alter table public.documents
  enable trigger zzz_v48_secure_projects_and_requests;

commit;

-- Conferência dos projetos oficiais.
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

-- Conferência de possíveis duplicatas restantes.
select
  id,
  data->>'name' as name,
  data->>'legacyType' as legacy_type,
  data->>'status' as status,
  data->>'active' as active
from public.documents
where collection_name = 'requestProjects'
  and id not in ('programacao', 'cancelamento', 'tef_elgin')
  and lower(coalesce(data->>'name', '')) in ('programação', 'programacao', 'cancelamento', 'tef elgin', 'tef_elgin')
order by id;
