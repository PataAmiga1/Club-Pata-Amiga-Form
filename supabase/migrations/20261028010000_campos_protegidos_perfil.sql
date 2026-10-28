-- ============================================================================
-- Campos protegidos (28-oct-2026): un miembro ya no puede darse permisos,
-- membresía ni aprobaciones escribiendo directo en la base.
--
-- EL HOYO (comprobado en producción, solo lectura, 28-oct):
--   La política «own profile update» de `profiles` es
--   `using (auth.uid() = id) with check (auth.uid() = id)` sin límite de
--   columnas, y `authenticated` tiene UPDATE sobre todas. Con la llave pública
--   y su propia sesión, cualquier miembro podía mandar
--     PATCH /rest/v1/profiles?id=eq.<su id>   {"role":"super_admin"}
--   y `is_admin()` (que lee `profiles.role`) le abría el panel completo: CURP,
--   CLABE e INE de todos. Lo mismo con `membership_status = 'active'`, que es
--   lo que `is_active_member()` revisa para dejar pedir reintegros.
--
--   El mismo patrón (política del dueño, sin guarda de columnas) existe en:
--     · pets            «own pets insert/update»: aprobarse el peludo o borrarse
--                       el tiempo de espera (`waiting_period_*`).
--     · reimbursements  «own reimbursements insert»: crear la solicitud ya
--                       `approved`/`paid` con `amount_approved` propio.
--     · ambassadors     «ambassador insert» with check (true) — incluso anon:
--                       darse de alta ya `approved` y con código a elección.
--     · wellness_centers «wellness insert» with check (true) y «center owner
--                       update»: el dueño se aprobaba solo y salía en el
--                       directorio público con sus promociones.
--     · appeals         «own appeals insert»: crear la apelación ya resuelta.
--
-- LA GUARDA: un trigger BEFORE por tabla. Solo actúa cuando la petición viene
-- de un usuario por PostgREST (`auth.role()` = 'authenticated' o 'anon').
-- NO toca:
--   · la llave de servicio (`service_role`): toda la plataforma escribe estas
--     columnas así — webhook de Stripe, panel /admin, crons, alta de
--     embajadores y centros (src/lib/supabase/admin.ts).
--   · el SQL Editor / psql (sin JWT, `auth.role()` nulo): así se cambian hoy
--     los roles (scripts/cutover-fix-admin-roles.sql). No hay pantalla que
--     cambie roles.
--   · un admin con sesión propia (rol GUARDADO, el de antes del cambio):
--     `is_admin()` puede todo menos `role`; `role` exige `is_super_admin()`,
--     para que un admin no se suba a super_admin.
--
-- RAISE vs. CONSERVAR (por columna):
--   · RAISE (42501) en todo lo que da permisos, dinero o membresía. Ninguna
--     pantalla del miembro manda esas columnas (revisado en src/: ProfileForm,
--     PetForm, RequestForm y guardarTelefonoParaChat mandan solo sus campos),
--     así que un intento es abuso o bug y conviene que truene y se vea.
--   · CONSERVAR el valor anterior, en silencio, en atribución (`utm_*`,
--     `ambassador_code_used`, `attribution`): bajo riesgo, y así una
--     actualización que mande la fila entera no se cae. `attribution` es la
--     columna de la rama feat/pixel-eventos, que trae su propio trigger
--     (profiles_proteger_atribucion) con la misma regla; aquí se repite sin
--     chocar de nombre y sin fallar si la columna todavía no existe (todo se
--     compara por jsonb, por nombre de llave).
--
-- QUEDAN FUERA A PROPÓSITO (el miembro los escribe legítimamente con su
-- sesión desde src/app/app/perfil/ProfileForm.tsx): `curp`, `birth_date`,
-- `profile_completed`, `avatar_url`, nombre, teléfono, domicilio. Ver la
-- nota de la entrega: la validación de mayoría de edad vive en el cliente.
--
-- Aditiva e idempotente: solo funciones y triggers (create or replace /
-- drop trigger if exists). No cambia políticas ni datos.
-- ============================================================================

-- ------------------------------------------------------------- ayudantes ----

-- ¿La petición la hace un usuario por PostgREST (no el servidor ni el SQL)?
create or replace function public.peticion_de_usuario()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(auth.role(), '') in ('authenticated', 'anon');
$$;

-- Columnas de `columnas` cuyo valor difiere entre dos filas (en jsonb).
-- Se compara como texto (->>) para que una columna que no exista en la tabla
-- cuente como "sin cambio" en vez de tronar.
create or replace function public.columnas_distintas(antes jsonb, despues jsonb, columnas text[])
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(c order by c), '{}')
  from unnest(columnas) as c
  where (antes ->> c) is distinct from (despues ->> c);
$$;

-- Para INSERT: columnas protegidas que traen algo distinto de su valor de
-- alta. `esperado` es un objeto {columna: valor}; solo se revisan las
-- columnas que sí existen en la fila nueva.
create or replace function public.columnas_fuera_de_alta(fila jsonb, esperado jsonb)
returns text[]
language sql
immutable
as $$
  select coalesce(array_agg(k order by k), '{}')
  from jsonb_object_keys(esperado) as k
  where fila ? k
    and (fila ->> k) is distinct from (esperado ->> k);
$$;

-- --------------------------------------------------------------- profiles ---

create or replace function public.proteger_campos_de_perfil()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- Dan permisos, membresía o acceso: un usuario no los toca nunca.
  protegidas constant text[] := array[
    'role', 'membership_status', 'member_since', 'waiting_period_end_date',
    'memberstack_id', 'legacy_password_migrated',
    'legacy_ambassador_password_hash', 'email', 'id'
  ];
  -- Atribución: se conserva el valor anterior, en silencio.
  conservadas constant text[] := array[
    'utm_source', 'utm_medium', 'utm_campaign', 'ambassador_code_used',
    'attribution'
  ];
  viejo jsonb;
  nuevo jsonb;
  cambiadas text[];
  restaurar jsonb;
begin
  if not public.peticion_de_usuario() then
    return new;
  end if;

  nuevo := to_jsonb(new);

  if tg_op = 'INSERT' then
    -- No hay política de INSERT en profiles (la fila la crea handle_new_user,
    -- security definer). Esto es cinturón por si algún día se abre una.
    cambiadas := public.columnas_fuera_de_alta(nuevo, jsonb_build_object(
      'role', 'member',
      'membership_status', 'pending_payment',
      'member_since', null,
      'waiting_period_end_date', null,
      'memberstack_id', null,
      'legacy_password_migrated', false,
      'legacy_ambassador_password_hash', null,
      'ambassador_code_used', null,
      'attribution', null
    ));
    if cardinality(cambiadas) > 0 then
      raise exception 'No puedes crear tu perfil con estos campos: %', array_to_string(cambiadas, ', ')
        using errcode = '42501';
    end if;
    return new;
  end if;

  viejo := to_jsonb(old);
  cambiadas := public.columnas_distintas(viejo, nuevo, protegidas);

  if cardinality(cambiadas) > 0 then
    -- Admin con sesión: puede todo menos el rol; el rol, solo super_admin.
    -- is_admin()/is_super_admin() leen el rol GUARDADO (el de antes).
    if 'role' = any(cambiadas) and not public.is_super_admin() then
      raise exception 'Solo un super admin puede cambiar roles.'
        using errcode = '42501';
    end if;
    if not public.is_admin() then
      raise exception 'No puedes modificar estos campos de tu perfil: %', array_to_string(cambiadas, ', ')
        using errcode = '42501';
    end if;
  end if;

  if not public.is_admin() then
    select jsonb_object_agg(c, viejo -> c)
      into restaurar
      from unnest(conservadas) as c
     where viejo ? c
       and (viejo -> c) is distinct from (nuevo -> c);
    if restaurar is not null then
      new := jsonb_populate_record(new, restaurar);
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists proteger_campos_de_perfil on public.profiles;
create trigger proteger_campos_de_perfil
  before insert or update on public.profiles
  for each row execute function public.proteger_campos_de_perfil();

-- ------------------------------------------------------------------- pets ---
-- El miembro registra y edita a su peludo con su sesión
-- (src/components/registro/PetForm.tsx): nombre, especie, raza, edad, colores,
-- adopción, foto, certificado. Lo que decide el comité y los tiempos de
-- espera solo los escribe el servidor (resolvePet / iniciarEsperaDeMascota /
-- darDeBaja, con la llave de servicio).

create or replace function public.proteger_campos_de_mascota()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  protegidas constant text[] := array[
    'approval_status', 'approval_notes', 'approved_at', 'approved_by',
    'waiting_period_start_date', 'waiting_period_end_date',
    'waiting_period_bypassed', 'is_active', 'is_deceased', 'deceased_at',
    'deactivation_reason', 'deactivated_at', 'info_requested', 'user_id'
  ];
  cambiadas text[];
begin
  if not public.peticion_de_usuario() or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    cambiadas := public.columnas_fuera_de_alta(to_jsonb(new), jsonb_build_object(
      'approval_status', 'pending',
      'approval_notes', null,
      'approved_at', null,
      'approved_by', null,
      'waiting_period_start_date', null,
      'waiting_period_end_date', null,
      'waiting_period_bypassed', false,
      'is_active', true,
      'is_deceased', false,
      'deceased_at', null,
      'deactivation_reason', null,
      'deactivated_at', null,
      'info_requested', false
    ));
  else
    cambiadas := public.columnas_distintas(to_jsonb(old), to_jsonb(new), protegidas);
  end if;

  if cardinality(cambiadas) > 0 then
    raise exception 'Estos datos del peludo los define el comité: %', array_to_string(cambiadas, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_campos_de_mascota on public.pets;
create trigger proteger_campos_de_mascota
  before insert or update on public.pets
  for each row execute function public.proteger_campos_de_mascota();

-- --------------------------------------------------------- reimbursements ---
-- El miembro crea su solicitud con su sesión (plan $159,
-- src/app/app/reintegros/nueva/RequestForm.tsx). Nunca puede nacer resuelta.
-- No hay UPDATE para el miembro en esta tabla (solo «admin reimbursements
-- update»), así que basta con el INSERT; el UPDATE se cubre igual por si
-- algún día se abre una política.

create or replace function public.proteger_campos_de_reintegro()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  protegidas constant text[] := array[
    'status', 'amount_approved', 'rejection_reason', 'admin_notes',
    'resolved_by', 'resolved_at', 'paid_at', 'paid_by', 'payment_reference',
    'payment_note', 'plan_balance', 'due_business_date', 'sla_breached_at',
    'high_amount_alert_at', 'free_month_applied_at', 'free_month_cents',
    'free_month_stripe_ref', 'free_month_applied_by', 'user_id', 'folio'
  ];
  cambiadas text[];
begin
  if not public.peticion_de_usuario() or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    cambiadas := public.columnas_fuera_de_alta(to_jsonb(new), jsonb_build_object(
      'status', 'pending',
      'amount_approved', null,
      'rejection_reason', null,
      'admin_notes', null,
      'resolved_by', null,
      'resolved_at', null,
      'paid_at', null,
      'paid_by', null,
      'payment_reference', null,
      'payment_note', null,
      'plan_balance', null,
      'due_business_date', null,
      'sla_breached_at', null,
      'high_amount_alert_at', null,
      'free_month_applied_at', null,
      'free_month_cents', null,
      'free_month_stripe_ref', null,
      'free_month_applied_by', null
    ));
  else
    cambiadas := public.columnas_distintas(to_jsonb(old), to_jsonb(new), protegidas);
  end if;

  if cardinality(cambiadas) > 0 then
    raise exception 'Estos datos del reintegro los define el comité: %', array_to_string(cambiadas, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_campos_de_reintegro on public.reimbursements;
create trigger proteger_campos_de_reintegro
  before insert or update on public.reimbursements
  for each row execute function public.proteger_campos_de_reintegro();

-- ------------------------------------------------------------ ambassadors ---
-- La plataforma da de alta y edita embajadores SOLO con la llave de servicio
-- (src/app/embajadores/actions.ts, src/app/embajador/actions.ts). La política
-- «ambassador insert» with check (true) deja insertar hasta a anon: se queda
-- (por si algún formulario viejo la usa) pero la fila nace pendiente, sin
-- código y sin cuenta ajena.

create or replace function public.proteger_campos_de_embajador()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  protegidas constant text[] := array[
    'status', 'rejection_reason', 'referral_code', 'code_change_count',
    'memberstack_id', 'deactivated_at', 'deactivation_reason',
    'info_requested', 'user_id'
  ];
  cambiadas text[];
begin
  if not public.peticion_de_usuario() or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    cambiadas := public.columnas_fuera_de_alta(to_jsonb(new), jsonb_build_object(
      'status', 'pending',
      'rejection_reason', null,
      'referral_code', null,
      'code_change_count', 0,
      'memberstack_id', null,
      'deactivated_at', null,
      'deactivation_reason', null,
      'info_requested', false
    ));
    if new.user_id is not null and new.user_id is distinct from auth.uid() then
      cambiadas := array_append(cambiadas, 'user_id');
    end if;
  else
    cambiadas := public.columnas_distintas(to_jsonb(old), to_jsonb(new), protegidas);
  end if;

  if cardinality(cambiadas) > 0 then
    raise exception 'Estos datos del embajador los define el equipo: %', array_to_string(cambiadas, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_campos_de_embajador on public.ambassadors;
create trigger proteger_campos_de_embajador
  before insert or update on public.ambassadors
  for each row execute function public.proteger_campos_de_embajador();

-- ------------------------------------------------------- wellness_centers ---
-- Igual que embajadores: la plataforma escribe con la llave de servicio
-- (src/app/centros/registro/actions.ts, src/app/centro/actions.ts). La
-- política «center owner update» deja al dueño editar su fila: puede seguir
-- editando sus datos, pero no aprobarse ni reasignarse.

create or replace function public.proteger_campos_de_centro()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  protegidas constant text[] := array[
    'status', 'rejection_reason', 'memberstack_id', 'deactivated_at',
    'deactivation_reason', 'info_requested', 'user_id'
  ];
  cambiadas text[];
begin
  if not public.peticion_de_usuario() or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    cambiadas := public.columnas_fuera_de_alta(to_jsonb(new), jsonb_build_object(
      'status', 'pending',
      'rejection_reason', null,
      'memberstack_id', null,
      'deactivated_at', null,
      'deactivation_reason', null,
      'info_requested', false
    ));
    if new.user_id is not null and new.user_id is distinct from auth.uid() then
      cambiadas := array_append(cambiadas, 'user_id');
    end if;
  else
    cambiadas := public.columnas_distintas(to_jsonb(old), to_jsonb(new), protegidas);
  end if;

  if cardinality(cambiadas) > 0 then
    raise exception 'Estos datos del centro los define el equipo: %', array_to_string(cambiadas, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_campos_de_centro on public.wellness_centers;
create trigger proteger_campos_de_centro
  before insert or update on public.wellness_centers
  for each row execute function public.proteger_campos_de_centro();

-- ---------------------------------------------------------------- appeals ---
-- La plataforma crea apelaciones con la llave de servicio
-- (src/app/app/apelaciones/actions.ts); la política «own appeals insert»
-- sigue abierta al dueño, pero la apelación no puede nacer resuelta.

create or replace function public.proteger_campos_de_apelacion()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  protegidas constant text[] := array[
    'status', 'resolution_notes', 'resolved_by', 'resolved_at', 'user_id'
  ];
  cambiadas text[];
begin
  if not public.peticion_de_usuario() or public.is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    cambiadas := public.columnas_fuera_de_alta(to_jsonb(new), jsonb_build_object(
      'status', 'pending',
      'resolution_notes', null,
      'resolved_by', null,
      'resolved_at', null
    ));
  else
    cambiadas := public.columnas_distintas(to_jsonb(old), to_jsonb(new), protegidas);
  end if;

  if cardinality(cambiadas) > 0 then
    raise exception 'Estos datos de la apelación los define el comité: %', array_to_string(cambiadas, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists proteger_campos_de_apelacion on public.appeals;
create trigger proteger_campos_de_apelacion
  before insert or update on public.appeals
  for each row execute function public.proteger_campos_de_apelacion();

notify pgrst, 'reload schema';
