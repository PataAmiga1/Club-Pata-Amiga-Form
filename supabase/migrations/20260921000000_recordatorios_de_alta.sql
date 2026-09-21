-- Secuencia de recordatorios del alta (equipo, 21-sep-2026)
--
-- Dos avisos distintos, los dos del mismo problema: la persona empezó y no
-- terminó.
--   · `perfil` — pagó, su membresía está activa, pero el perfil sigue
--     incompleto y el comité no puede aprobar a su peludo.
--   · `pago`   — creó su cuenta (y casi siempre registró a su peludo) y nunca
--     pagó.
--
-- POR QUÉ UNA TABLA. El recordatorio de datos faltantes que existía desde el
-- 5-ago no llevaba registro: le escribía a TODOS los incompletos cada lunes,
-- para siempre. Con una secuencia de tres avisos hace falta saber cuántos ya
-- salieron y cuándo, o la persona recibe el mismo correo sin fin.
--
-- LA GARANTÍA ES LA RESTRICCIÓN ÚNICA, no el código (mismo patrón que
-- `renewal_reminders`): se INSERTA primero y se manda el correo después. Si el
-- renglón ya existía, el insert falla y no sale nada. Dos procesos a la vez
-- —el cron y el botón del panel— quedan cubiertos; un «consulta y si no está,
-- manda» no lo cubriría.
create table if not exists member_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  -- 'perfil' | 'pago'
  tipo text not null check (tipo in ('perfil', 'pago')),
  -- 1, 2 o 3: cuál de los tres avisos de la secuencia es.
  numero smallint not null check (numero between 1 and 10),
  sent_at timestamptz not null default now(),
  unique (user_id, tipo, numero)
);

create index if not exists member_reminders_user_idx
  on member_reminders(user_id, tipo, sent_at desc);

comment on table member_reminders is
  'Un renglon por recordatorio de alta enviado (perfil incompleto o pago pendiente). La restriccion unica impide repetir el mismo aviso.';

-- Cerrada por omisión: la escribe el cron con el service role; solo el comité
-- necesita consultarla.
alter table member_reminders enable row level security;

drop policy if exists "recordatorios alta admin read" on member_reminders;
create policy "recordatorios alta admin read" on member_reminders
  for select using (public.is_admin());

-- Sin esto PostgREST no ve la tabla nueva y toda consulta falla con 400, que en
-- pantalla se lee como "no hay datos" y no como error.
notify pgrst, 'reload schema';
