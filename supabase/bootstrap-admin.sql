-- 1. Crie o usuário em Authentication > Users > Add user.
-- 2. Troque os valores abaixo e execute no SQL Editor.

insert into public.profiles (id, email, name, role, squad, active, access_locked, data)
select
  id,
  email,
  'NOME DO ADMINISTRADOR',
  'admin',
  '',
  true,
  false,
  jsonb_build_object(
    'name', 'NOME DO ADMINISTRADOR',
    'email', email,
    'role', 'admin',
    'squad', '',
    'active', true,
    'accessLocked', false,
    'createdAt', now()
  )
from auth.users
where lower(email) = lower('EMAIL_DO_ADMINISTRADOR')
on conflict (id) do update set
  name = excluded.name,
  role = 'admin',
  squad = '',
  active = true,
  access_locked = false,
  data = public.profiles.data || excluded.data;
