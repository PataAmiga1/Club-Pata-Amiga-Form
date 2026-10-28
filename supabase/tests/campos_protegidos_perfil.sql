-- ============================================================================
-- Prueba de la guarda de campos protegidos
-- (supabase/migrations/20261028010000_campos_protegidos_perfil.sql).
--
-- Cómo correrla: SOLO contra una base local o de pruebas que ya tenga todas
-- las migraciones (nunca producción). Todo va dentro de una transacción que
-- termina en ROLLBACK, así que no deja nada:
--
--   npx supabase db query --local -f supabase/tests/campos_protegidos_perfil.sql
--   (o pegarla completa en el SQL Editor del proyecto local)
--
-- Si algo falla, se detiene con «FALLA: …». Si todo pasa, el último aviso es
-- «OK: campos protegidos».
--
-- Simula al miembro igual que PostgREST: `set local role authenticated` +
-- `request.jwt.claims` con su `sub`.
-- ============================================================================

begin;

-- Dos usuarios de prueba (handle_new_user les crea su perfil)
insert into auth.users (id, email)
values ('00000000-0000-4000-8000-0000000000a1', 'guarda-miembro@prueba.local'),
       ('00000000-0000-4000-8000-0000000000a2', 'guarda-admin@prueba.local');
insert into public.profiles (id, email)
values ('00000000-0000-4000-8000-0000000000a1', 'guarda-miembro@prueba.local'),
       ('00000000-0000-4000-8000-0000000000a2', 'guarda-admin@prueba.local')
on conflict (id) do nothing;
update public.profiles set role = 'admin'
 where id = '00000000-0000-4000-8000-0000000000a2';  -- sin JWT: como el SQL Editor
insert into public.pets (id, user_id, name, species)
values ('00000000-0000-4000-8000-0000000000b1', '00000000-0000-4000-8000-0000000000a1', 'Guarda', 'dog');

-- ---------------------------------------------------------- como MIEMBRO ---
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a1","role":"authenticated"}', true);

do $$
declare
  ok boolean;
begin
  -- 1. Darse super_admin: debe tronar
  begin
    update public.profiles set role = 'super_admin' where id = auth.uid();
    raise exception 'FALLA: el miembro pudo cambiarse el rol';
  exception when insufficient_privilege then null;
  end;

  -- 2. Activarse la membresía: debe tronar
  begin
    update public.profiles set membership_status = 'active' where id = auth.uid();
    raise exception 'FALLA: el miembro pudo activarse la membresía';
  exception when insufficient_privilege then null;
  end;

  -- 3. Sus datos normales SÍ (lo que manda ProfileForm)
  update public.profiles
     set first_name = 'Prueba', phone = '+525555555555', curp = 'AAAA000000HDFAAA00',
         birth_date = '1990-01-01', profile_completed = true
   where id = auth.uid();
  if not found then raise exception 'FALLA: el miembro no pudo editar su perfil'; end if;

  -- 4. Atribución: no truena, pero conserva el valor anterior
  update public.profiles set utm_source = 'inventado' where id = auth.uid();
  select utm_source is null into ok from public.profiles where id = auth.uid();
  if not ok then raise exception 'FALLA: el miembro pudo cambiar utm_source'; end if;

  -- 5. Aprobarse el peludo / borrarse la espera: debe tronar
  begin
    update public.pets set approval_status = 'approved'
     where id = '00000000-0000-4000-8000-0000000000b1';
    raise exception 'FALLA: el miembro pudo aprobar a su peludo';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.pets set waiting_period_end_date = current_date
     where id = '00000000-0000-4000-8000-0000000000b1';
    raise exception 'FALLA: el miembro pudo moverse el tiempo de espera';
  exception when insufficient_privilege then null;
  end;

  -- 6. Editar el perfil del peludo SÍ (lo que manda PetForm)
  update public.pets set breed = 'Mestizo', coat_color = 'Café'
   where id = '00000000-0000-4000-8000-0000000000b1';
  if not found then raise exception 'FALLA: el miembro no pudo editar a su peludo'; end if;

  -- 7. Registrar un peludo ya aprobado: debe tronar; uno normal SÍ
  begin
    insert into public.pets (user_id, name, species, approval_status)
    values (auth.uid(), 'Trampa', 'cat', 'approved');
    raise exception 'FALLA: el miembro pudo registrar un peludo aprobado';
  exception when insufficient_privilege then null;
  end;
  insert into public.pets (user_id, name, species) values (auth.uid(), 'Normal', 'cat');

  -- 8. Darse de alta como embajador ya aprobado: debe tronar
  begin
    insert into public.ambassadors (first_name, email, status, user_id)
    values ('Trampa', 'guarda-miembro@prueba.local', 'approved', auth.uid());
    raise exception 'FALLA: se pudo crear un embajador aprobado';
  exception when insufficient_privilege then null;
  end;

  -- 9. Centro aliado ya aprobado: debe tronar
  begin
    insert into public.wellness_centers (name, status, user_id)
    values ('Trampa', 'approved', auth.uid());
    raise exception 'FALLA: se pudo crear un centro aprobado';
  exception when insufficient_privilege then null;
  end;

  raise notice 'miembro: ok';
end $$;

-- -------------------------------------------- como ADMIN con su sesión ---
reset role;
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"00000000-0000-4000-8000-0000000000a2","role":"authenticated"}', true);

do $$
begin
  -- Un admin (no super) no puede subirse a super_admin
  begin
    update public.profiles set role = 'super_admin' where id = auth.uid();
    raise exception 'FALLA: un admin pudo darse super_admin';
  exception when insufficient_privilege then null;
  end;
  -- Pero sí puede aprobar un peludo (política «own pets update» lo deja)
  update public.pets set approval_status = 'approved'
   where id = '00000000-0000-4000-8000-0000000000b1';
  if not found then raise exception 'FALLA: el admin no pudo aprobar el peludo'; end if;
  raise notice 'admin: ok';
end $$;

-- --------------------------------------------- llave de SERVICIO / SQL ---
reset role;
set local role service_role;
select set_config('request.jwt.claims', '{"role":"service_role"}', true);

do $$
begin
  update public.profiles set membership_status = 'active', role = 'ventas'
   where id = '00000000-0000-4000-8000-0000000000a1';
  if not found then raise exception 'FALLA: la llave de servicio no pudo escribir'; end if;
  raise notice 'servicio: ok';
end $$;

reset role;
select set_config('request.jwt.claims', '', true);
update public.profiles set role = 'member'
 where id = '00000000-0000-4000-8000-0000000000a1';  -- SQL sin JWT: debe pasar

do $$ begin raise notice 'OK: campos protegidos'; end $$;

rollback;
