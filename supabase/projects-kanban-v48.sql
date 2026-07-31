-- Painel de Solicitações v48
-- Projetos configuráveis, formulários dinâmicos e colunas administráveis.
-- Execute uma única vez após legal-terms-v47.sql.

begin;

alter table public.documents add column if not exists project_id text;
alter table public.documents add column if not exists column_id text;
create index if not exists documents_project_idx on public.documents(collection_name, project_id);
create index if not exists documents_column_idx on public.documents(collection_name, column_id);

create or replace function public.current_user_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role
  from public.profiles p
  where p.id = auth.uid()
    and p.active = true
    and p.access_locked = false
  limit 1;
$$;

revoke all on function public.current_user_role() from public;
grant execute on function public.current_user_role() to authenticated, service_role;

create or replace function public.digits_only(p_value text)
returns text
language sql
immutable
as $$
  select regexp_replace(coalesce(p_value, ''), '[^0-9]', '', 'g');
$$;

create or replace function public.valid_cpf(p_value text)
returns boolean
language plpgsql
immutable
as $$
declare
  d text := public.digits_only(p_value);
  sum_value integer;
  digit integer;
  i integer;
begin
  if length(d) <> 11 or d ~ '^(.)\1{10}$' then return false; end if;
  sum_value := 0;
  for i in 1..9 loop sum_value := sum_value + substr(d, i, 1)::integer * (11 - i); end loop;
  digit := (sum_value * 10) % 11;
  if digit = 10 then digit := 0; end if;
  if digit <> substr(d, 10, 1)::integer then return false; end if;
  sum_value := 0;
  for i in 1..10 loop sum_value := sum_value + substr(d, i, 1)::integer * (12 - i); end loop;
  digit := (sum_value * 10) % 11;
  if digit = 10 then digit := 0; end if;
  return digit = substr(d, 11, 1)::integer;
end;
$$;

create or replace function public.valid_cnpj(p_value text)
returns boolean
language plpgsql
immutable
as $$
declare
  d text := public.digits_only(p_value);
  weights1 integer[] := array[5,4,3,2,9,8,7,6,5,4,3,2];
  weights2 integer[] := array[6,5,4,3,2,9,8,7,6,5,4,3,2];
  sum_value integer := 0;
  remainder integer;
  digit integer;
  i integer;
begin
  if length(d) <> 14 or d ~ '^(.)\1{13}$' then return false; end if;
  for i in 1..12 loop sum_value := sum_value + substr(d, i, 1)::integer * weights1[i]; end loop;
  remainder := sum_value % 11;
  digit := case when remainder < 2 then 0 else 11 - remainder end;
  if digit <> substr(d, 13, 1)::integer then return false; end if;
  sum_value := 0;
  for i in 1..13 loop sum_value := sum_value + substr(d, i, 1)::integer * weights2[i]; end loop;
  remainder := sum_value % 11;
  digit := case when remainder < 2 then 0 else 11 - remainder end;
  return digit = substr(d, 14, 1)::integer;
end;
$$;

create or replace function public.valid_cpf_cnpj(p_value text)
returns boolean
language sql
immutable
as $$
  select case length(public.digits_only(p_value))
    when 11 then public.valid_cpf(p_value)
    when 14 then public.valid_cnpj(p_value)
    else false
  end;
$$;

insert into public.documents (collection_name, id, data)
values
  ('requestProjects', 'programacao', jsonb_build_object(
    'id','programacao','name','Programação','description','Solicitações de programação e melhoria do sistema.',
    'audience','all','status','published','active',true,'legacyType','programacao','order',10,
    'standardFields','{}'::jsonb,'customFields','[]'::jsonb,'createdAt',now(),'updatedAt',now()
  )),
  ('requestProjects', 'cancelamento', jsonb_build_object(
    'id','cancelamento','name','Cancelamento','description','Chamados de cancelamento de clientes.',
    'audience','all','status','published','active',true,'legacyType','cancelamento','order',20,
    'standardFields','{}'::jsonb,'customFields','[]'::jsonb,'createdAt',now(),'updatedAt',now()
  )),
  ('requestProjects', 'tef_elgin', jsonb_build_object(
    'id','tef_elgin','name','TEF Elgin','description','Solicitações de implantação e configuração de TEF Elgin.',
    'audience','all','status','published','active',true,'legacyType','tef_elgin','order',30,
    'standardFields','{}'::jsonb,'customFields','[]'::jsonb,'createdAt',now(),'updatedAt',now()
  )),
  ('kanbanColumns', 'nova', jsonb_build_object('id','nova','name','Nova','order',10,'active',true,'pausesTimer',false,'completed',false,'color','blue','createdAt',now(),'updatedAt',now())),
  ('kanbanColumns', 'analise', jsonb_build_object('id','analise','name','Em análise','order',20,'active',true,'pausesTimer',false,'completed',false,'color','purple','createdAt',now(),'updatedAt',now())),
  ('kanbanColumns', 'aguardando', jsonb_build_object('id','aguardando','name','Aguardando','order',30,'active',true,'pausesTimer',true,'completed',false,'color','amber','createdAt',now(),'updatedAt',now())),
  ('kanbanColumns', 'bloqueio', jsonb_build_object('id','bloqueio','name','Bloqueio','order',40,'active',true,'pausesTimer',true,'completed',false,'color','red','createdAt',now(),'updatedAt',now())),
  ('kanbanColumns', 'concluida', jsonb_build_object('id','concluida','name','Concluída','order',50,'active',true,'pausesTimer',false,'completed',true,'color','green','createdAt',now(),'updatedAt',now()))
on conflict (collection_name, id) do nothing;

create or replace function public.project_document(p_project_id text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select d.data
  from public.documents d
  where d.collection_name = 'requestProjects'
    and d.id = p_project_id
  limit 1;
$$;

create or replace function public.project_allows_current_user(p_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_user_active() and exists (
    select 1
    from public.documents d
    where d.collection_name = 'requestProjects'
      and d.id = p_project_id
      and coalesce((d.data->>'active')::boolean, true) = true
      and coalesce(d.data->>'status', 'published') = 'published'
      and (
        (public.current_user_role() = 'admin' and coalesce(d.data->>'audience', 'all') in ('all', 'admin'))
        or (public.current_user_role() = 'solicitante' and coalesce(d.data->>'audience', 'all') in ('all', 'solicitante'))
      )
  );
$$;

create or replace function public.first_active_kanban_column()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select d.id
  from public.documents d
  where d.collection_name = 'kanbanColumns'
    and coalesce((d.data->>'active')::boolean, true) = true
    and coalesce((d.data->>'completed')::boolean, false) = false
  order by coalesce((d.data->>'order')::numeric, 999999), d.id
  limit 1;
$$;

create or replace function public.valid_request_column(p_column_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.documents d
    where d.collection_name = 'kanbanColumns'
      and d.id = p_column_id
      and coalesce((d.data->>'active')::boolean, true) = true
  );
$$;

create or replace function public.validate_request_schema(p_data jsonb, p_schema jsonb)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  field_record record;
  field_config jsonb;
  field_value text;
  values_object jsonb := coalesce(p_data->'customFieldValues', '{}'::jsonb);
  max_length integer;
begin
  if jsonb_typeof(values_object) <> 'object' then return false; end if;

  for field_record in
    select key, value from jsonb_each(coalesce(p_schema->'standardFields', '{}'::jsonb))
  loop
    field_config := field_record.value;
    if coalesce((field_config->>'enabled')::boolean, false) then
      field_value := btrim(coalesce(p_data->>field_record.key, ''));
      if coalesce((field_config->>'required')::boolean, false) and field_value = '' then return false; end if;
      if field_value <> '' then
        if field_record.key = 'document' and not public.valid_cpf_cnpj(field_value) then return false; end if;
        if field_record.key = 'phone' and length(public.digits_only(field_value)) not in (10, 11) then return false; end if;
        if field_record.key = 'email' and field_value !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then return false; end if;
        if field_record.key = 'companyName' and length(field_value) > 120 then return false; end if;
        if field_record.key = 'email' and length(field_value) > 160 then return false; end if;
      end if;
    end if;
  end loop;

  for field_record in
    select value as field from jsonb_array_elements(coalesce(p_schema->'customFields', '[]'::jsonb))
  loop
    if coalesce((field_record.field->>'active')::boolean, true) then
      field_value := btrim(coalesce(values_object->>(field_record.field->>'id'), ''));
      max_length := least(1000, greatest(1, coalesce((field_record.field->>'maxLength')::integer, 1000)));
      if coalesce((field_record.field->>'required')::boolean, false) and field_value = '' then return false; end if;
      if length(field_value) > max_length then return false; end if;
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_object_keys(values_object) supplied(key)
    where not exists (
      select 1
      from jsonb_array_elements(coalesce(p_schema->'customFields', '[]'::jsonb)) configured(field)
      where configured.field->>'id' = supplied.key
        and coalesce((configured.field->>'active')::boolean, true)
    )
  ) then return false; end if;

  return true;
exception when others then
  return false;
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
    and coalesce(p_data->>'projectId', '') <> ''
    and public.project_allows_current_user(p_data->>'projectId')
    and coalesce(p_data->>'status', '') = public.first_active_kanban_column()
    and public.valid_request_column(p_data->>'status')
    and coalesce(p_data->>'assigneeUid', '') = ''
    and public.validate_request_schema(
      p_data,
      coalesce(p_data->'projectFormSnapshot', public.project_document(p_data->>'projectId'))
    );
$$;

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
  new.project_id := coalesce(new.data->>'projectId', new.data->>'type');
  new.column_id := coalesce(new.data->>'columnId', new.data->>'status');
  new.squad := new.data->>'squad';
  new.status := new.data->>'status';
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.v48_secure_projects_and_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := '';
  v_email text := '';
  v_project_id text;
  v_project jsonb;
  v_schema jsonb;
  v_initial_column text;
  v_legacy_type text;
  v_is_restore boolean := false;
begin
  if v_uid is null then return new; end if;

  if new.collection_name in ('requestProjects', 'kanbanColumns') then
    if not public.current_user_is_admin() then raise exception 'permission-denied'; end if;
    if length(btrim(coalesce(new.data->>'name', ''))) < 2 then raise exception 'invalid-name'; end if;
    new.data := new.data || jsonb_build_object('id', new.id, 'updatedByUid', v_uid::text);
    if new.collection_name = 'requestProjects' then
      if coalesce(new.data->>'audience', '') not in ('all','admin','solicitante') then raise exception 'invalid-audience'; end if;
      if coalesce(new.data->>'status', '') not in ('draft','published','archived') then raise exception 'invalid-project-status'; end if;
      if coalesce(new.data->>'legacyType', 'custom') not in ('programacao','cancelamento','tef_elgin','custom') then raise exception 'invalid-project-type'; end if;
      if tg_op = 'UPDATE' and old.data->>'legacyType' is distinct from new.data->>'legacyType' then raise exception 'immutable-project-type'; end if;
      if exists (
        select 1 from jsonb_array_elements(coalesce(new.data->'customFields','[]'::jsonb)) f
        where length(btrim(coalesce(f->>'id',''))) = 0
          or length(btrim(coalesce(f->>'label',''))) < 1
          or coalesce((f->>'maxLength')::integer,1000) not between 1 and 1000
      ) then raise exception 'invalid-project-field'; end if;
      if exists (
        select 1 from (
          select f->>'id' id, count(*) total
          from jsonb_array_elements(coalesce(new.data->'customFields','[]'::jsonb)) f
          group by f->>'id'
          having count(*) > 1
        ) duplicate_fields
      ) then raise exception 'duplicate-project-field'; end if;
    else
      if coalesce(new.data->>'color','blue') not in ('blue','purple','amber','red','green','cyan','gray') then raise exception 'invalid-column-color'; end if;
      if tg_op = 'UPDATE'
         and coalesce((old.data->>'active')::boolean,true) = true
         and coalesce((new.data->>'active')::boolean,true) = false
         and exists (
           select 1 from public.documents r
           where r.collection_name = 'requests'
             and coalesce(r.column_id, r.status) = new.id
         ) then raise exception 'column-has-requests'; end if;
    end if;
    return new;
  end if;

  if new.collection_name <> 'requests' then return new; end if;

  select p.name, p.email into v_name, v_email
  from public.profiles p
  where p.id = v_uid and p.active = true and p.access_locked = false;
  if not found then raise exception 'permission-denied'; end if;

  v_project_id := coalesce(new.data->>'projectId', new.data->>'type');
  v_project := public.project_document(v_project_id);
  if v_project is null then raise exception 'project-not-found'; end if;
  v_legacy_type := coalesce(v_project->>'legacyType', 'custom');

  if tg_op = 'INSERT' then
    v_is_restore := public.current_user_is_admin() and exists (
      select 1 from public.documents archived
      where archived.collection_name = 'archivedRequests'
        and archived.id = new.id
        and coalesce(archived.data->>'projectId', archived.data->>'type') = v_project_id
    );

    if not v_is_restore and not public.project_allows_current_user(v_project_id) then
      raise exception 'project-not-available';
    end if;

    v_initial_column := case
      when v_is_restore then coalesce(nullif(new.data->>'status',''), public.first_active_kanban_column())
      else public.first_active_kanban_column()
    end;
    if v_initial_column is null then raise exception 'kanban-without-open-column'; end if;
    if not public.valid_request_column(v_initial_column) then raise exception 'invalid-kanban-column'; end if;

    if v_is_restore then
      v_schema := coalesce(new.data->'projectFormSnapshot', jsonb_build_object(
        'projectName', v_project->>'name',
        'standardFields', coalesce(v_project->'standardFields','{}'::jsonb),
        'customFields', coalesce(v_project->'customFields','[]'::jsonb)
      ));
    else
      -- Em novas solicitações, o esquema sempre vem do cadastro do projeto.
      -- O navegador não pode substituir obrigatoriedade ou validações via API.
      v_schema := jsonb_build_object(
        'projectName', v_project->>'name',
        'standardFields', coalesce(v_project->'standardFields','{}'::jsonb),
        'customFields', coalesce(v_project->'customFields','[]'::jsonb)
      );
    end if;

    if v_is_restore then
      new.data := new.data || jsonb_build_object(
        'projectId', v_project_id,
        'projectName', coalesce(v_project->>'name', new.data->>'projectName', v_project_id),
        'type', v_legacy_type,
        'status', v_initial_column,
        'columnId', v_initial_column,
        'projectFormSnapshot', v_schema
      );
    else
      new.data := new.data || jsonb_build_object(
        'projectId', v_project_id,
        'projectName', coalesce(v_project->>'name', v_project_id),
        'type', v_legacy_type,
        'status', v_initial_column,
        'columnId', v_initial_column,
        'requesterUid', v_uid::text,
        'requesterName', coalesce(nullif(v_name,''), v_email, 'Usuário'),
        'requesterEmail', coalesce(v_email,''),
        'assigneeUid', '',
        'assigneeName', '',
        'projectFormSnapshot', v_schema
      );
    end if;
  else
    if coalesce(old.data->>'projectId', old.data->>'type') is distinct from v_project_id then raise exception 'immutable-project'; end if;
    if old.data->>'requesterUid' is distinct from new.data->>'requesterUid' then raise exception 'immutable-requester'; end if;
    if old.data->>'type' is distinct from new.data->>'type' then raise exception 'immutable-request-type'; end if;
    v_schema := coalesce(old.data->'projectFormSnapshot', jsonb_build_object(
      'projectName', v_project->>'name',
      'standardFields', coalesce(v_project->'standardFields','{}'::jsonb),
      'customFields', coalesce(v_project->'customFields','[]'::jsonb)
    ));
    new.data := new.data || jsonb_build_object(
      'projectId', v_project_id,
      'projectName', coalesce(v_project->>'name', old.data->>'projectName', v_project_id),
      'type', v_legacy_type,
      'projectFormSnapshot', v_schema,
      'columnId', coalesce(new.data->>'status', old.data->>'status')
    );
    if not public.valid_request_column(new.data->>'status') then raise exception 'invalid-kanban-column'; end if;
  end if;

  if not public.validate_request_schema(new.data, v_schema) then raise exception 'invalid-project-form-data'; end if;

  new.requester_uid := public.safe_uuid(new.data->>'requesterUid');
  new.assignee_uid := public.safe_uuid(new.data->>'assigneeUid');
  new.document_type := new.data->>'type';
  new.project_id := new.data->>'projectId';
  new.column_id := new.data->>'columnId';
  new.squad := new.data->>'squad';
  new.status := new.data->>'status';
  return new;
end;
$$;

revoke all on function public.v48_secure_projects_and_requests() from public;
drop trigger if exists zzz_v48_secure_projects_and_requests on public.documents;
create trigger zzz_v48_secure_projects_and_requests
before insert or update on public.documents
for each row execute function public.v48_secure_projects_and_requests();

create or replace function public.v48_assert_kanban_configuration()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.documents d
    where d.collection_name = 'kanbanColumns'
      and coalesce((d.data->>'active')::boolean,true) = true
      and coalesce((d.data->>'completed')::boolean,false) = false
  ) then raise exception 'kanban-needs-open-column'; end if;
  return null;
end;
$$;

drop trigger if exists zzzz_v48_assert_kanban_configuration on public.documents;
drop trigger if exists zzzz_v48_assert_kanban_configuration_write on public.documents;
drop trigger if exists zzzz_v48_assert_kanban_configuration_delete on public.documents;
create constraint trigger zzzz_v48_assert_kanban_configuration_write
after insert or update on public.documents
deferrable initially deferred
for each row
when (new.collection_name = 'kanbanColumns')
execute function public.v48_assert_kanban_configuration();
create constraint trigger zzzz_v48_assert_kanban_configuration_delete
after delete on public.documents
deferrable initially deferred
for each row
when (old.collection_name = 'kanbanColumns')
execute function public.v48_assert_kanban_configuration();

update public.documents d
set data = d.data || jsonb_build_object(
      'projectId', coalesce(nullif(d.data->>'projectId',''), nullif(d.data->>'type',''), 'programacao'),
      'projectName', case coalesce(nullif(d.data->>'type',''), 'programacao')
        when 'cancelamento' then 'Cancelamento'
        when 'tef_elgin' then 'TEF Elgin'
        else 'Programação'
      end,
      'columnId', coalesce(nullif(d.data->>'status',''), 'nova'),
      'projectFormSnapshot', coalesce(d.data->'projectFormSnapshot', jsonb_build_object('standardFields','{}'::jsonb,'customFields','[]'::jsonb))
    ),
    project_id = coalesce(nullif(d.data->>'projectId',''), nullif(d.data->>'type',''), 'programacao'),
    column_id = coalesce(nullif(d.data->>'status',''), 'nova')
where d.collection_name in ('requests','archivedRequests');

-- Projetos e colunas são configurações operacionais legíveis pelos usuários autorizados.
drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
using (
  public.current_user_active()
  and (
    public.current_user_is_admin()
    or (collection_name = 'requests' and public.can_view_request(id))
    or (collection_name in ('requestComments','requestHistory','requestAttachments') and public.can_view_request(request_id))
    or (collection_name = 'notifications' and target_uid = auth.uid())
    or (collection_name = 'savedFilters' and owner_uid = auth.uid())
    or collection_name = 'commentTemplates'
    or collection_name in ('requestProjects','kanbanColumns')
  )
);

-- Configurações usadas em registros nunca são apagadas; ficam arquivadas.
drop policy if exists v48_configurations_cannot_be_deleted on public.documents;
create policy v48_configurations_cannot_be_deleted
on public.documents
as restrictive
for delete
to authenticated
using (collection_name not in ('requestProjects','kanbanColumns'));

-- Solicitações só podem permanecer vinculadas a um projeto e coluna válidos.
drop policy if exists v48_requests_require_project_and_column on public.documents;
create policy v48_requests_require_project_and_column
on public.documents
as restrictive
for insert
to authenticated
with check (
  collection_name <> 'requests'
  or (
    project_id is not null
    and column_id is not null
    and public.valid_request_column(column_id)
  )
);

-- Os novos campos entram no Realtime usado pelo adaptador de coleções.
do $$
begin
  begin
    alter publication supabase_realtime add table public.documents;
  exception when duplicate_object then null;
  end;
end $$;

commit;
