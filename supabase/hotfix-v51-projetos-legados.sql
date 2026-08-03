-- Hotfix v51 - restaura o tipo interno dos projetos padrão.
-- Corrige Cancelamento e TEF Elgin quando o campo legacyType foi removido
-- ou gravado como "custom" no documento requestProjects.
-- Execute no SQL Editor do Supabase com uma conta administrativa do projeto.

begin;

-- O trigger da v48 torna o tipo do projeto imutável. Ele é desativado somente
-- dentro desta transação para reparar os três projetos padrão e reativado antes do commit.
alter table public.documents
  disable trigger zzz_v48_secure_projects_and_requests;

update public.documents
set data = data || jsonb_build_object(
      'id', id,
      'legacyType', id,
      'updatedAt', now()
    ),
    updated_at = now()
where collection_name = 'requestProjects'
  and id in ('programacao', 'cancelamento', 'tef_elgin');

alter table public.documents
  enable trigger zzz_v48_secure_projects_and_requests;

commit;

-- Conferência: os três resultados devem exibir legacy_type igual ao próprio id.
select
  id,
  data->>'name' as name,
  data->>'legacyType' as legacy_type,
  data->>'description' as description
from public.documents
where collection_name = 'requestProjects'
  and id in ('programacao', 'cancelamento', 'tef_elgin')
order by id;

-- Diagnóstico opcional de projetos personalizados com nomes duplicados.
select
  id,
  data->>'name' as name,
  data->>'legacyType' as legacy_type,
  data->>'status' as status
from public.documents
where collection_name = 'requestProjects'
  and lower(coalesce(data->>'name', '')) in ('programação', 'programacao', 'cancelamento', 'tef elgin')
order by name, id;
