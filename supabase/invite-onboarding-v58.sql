-- Painel de Solicitações v58
-- Finalização atômica e segura do cadastro por convite.
-- Execute uma vez no SQL Editor do Supabase.

begin;

create or replace function public.accept_user_invite(p_token text)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_invite public.user_invites%rowtype;
  v_name text;
  v_role text;
  v_squad text;
  v_profile_data jsonb;
begin
  if v_uid is null or v_email = '' then
    raise exception 'invite-auth-required';
  end if;

  if coalesce(nullif(btrim(p_token), ''), '') = '' then
    raise exception 'invite-invalid';
  end if;

  select *
    into v_invite
  from public.user_invites
  where token = p_token
  for update;

  if not found then
    raise exception 'invite-invalid';
  end if;

  if lower(v_invite.email) <> v_email then
    raise exception 'invite-email-mismatch';
  end if;

  if v_invite.status = 'accepted'
     and public.safe_uuid(v_invite.data->>'acceptedUid') = v_uid
     and exists (select 1 from public.profiles where id = v_uid) then
    select data into v_profile_data from public.profiles where id = v_uid;
    return v_profile_data || jsonb_build_object('uid', v_uid::text);
  end if;

  if v_invite.status <> 'pending' then
    raise exception 'invite-invalid';
  end if;

  if v_invite.expires_at is not null and v_invite.expires_at <= now() then
    raise exception 'invite-expired';
  end if;

  if exists (select 1 from public.profiles where id = v_uid) then
    raise exception 'profile-already-exists';
  end if;

  v_name := left(btrim(coalesce(v_invite.data->>'name', '')), 120);
  v_role := case
    when v_invite.data->>'role' in ('admin', 'solicitante') then v_invite.data->>'role'
    else 'solicitante'
  end;
  v_squad := case
    when v_role = 'solicitante'
      and v_invite.data->>'squad' in ('squad_a', 'squad_b', 'squad_d', 'squad_e')
      then v_invite.data->>'squad'
    else ''
  end;

  if v_name = '' then
    raise exception 'invite-invalid';
  end if;

  if v_role = 'solicitante' and v_squad = '' then
    raise exception 'invite-invalid';
  end if;

  v_profile_data := jsonb_build_object(
    'name', v_name,
    'email', v_email,
    'role', v_role,
    'squad', v_squad,
    'active', true,
    'accessLocked', false,
    'inviteToken', p_token,
    'createdAt', now(),
    'updatedAt', now()
  );

  insert into public.profiles (
    id,
    email,
    name,
    role,
    squad,
    active,
    access_locked,
    data,
    created_at,
    updated_at
  ) values (
    v_uid,
    v_email,
    v_name,
    v_role,
    v_squad,
    true,
    false,
    v_profile_data,
    now(),
    now()
  );

  update public.user_invites
  set status = 'accepted',
      data = data || jsonb_build_object(
        'status', 'accepted',
        'acceptedAt', now(),
        'acceptedUid', v_uid::text,
        'updatedAt', now()
      ),
      updated_at = now()
  where token = p_token;

  return v_profile_data || jsonb_build_object('uid', v_uid::text);
end;
$$;

revoke all on function public.accept_user_invite(text) from public;
grant execute on function public.accept_user_invite(text) to authenticated;

commit;
