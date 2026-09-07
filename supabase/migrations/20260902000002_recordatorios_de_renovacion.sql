-- Recordatorios de renovación: el registro de lo que ya se mandó
--
-- POR QUÉ HACE FALTA UNA TABLA. El cron de cumpleaños no lleva registro: se
-- fía de correr una vez al día y de que la fecha coincida exacto. Para un
-- "te vamos a cobrar el día X" eso no alcanza — si el cron se reintenta, si
-- alguien aprieta el botón del panel el mismo día, o si Vercel lo dispara dos
-- veces, la persona recibe dos avisos de cobro y escribe a soporte.
--
-- LA GARANTÍA ES LA RESTRICCIÓN ÚNICA, no el código. Se INSERTA primero y se
-- manda el correo después: si el renglón ya existía, el insert falla y no se
-- manda nada. Así queda cubierto incluso si dos procesos corren a la vez, que
-- es justo lo que un `select … if not exists` no cubre.
--
-- `period_end` va en la llave a propósito: el mismo miembro debe poder recibir
-- su aviso de 7 días en octubre y otra vez en noviembre. Lo que no se repite
-- es el mismo aviso para el mismo cobro.

create table if not exists renewal_reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  subscription_id uuid not null references subscriptions(id) on delete cascade,
  -- El cobro que se está anunciando.
  period_end timestamptz not null,
  -- Con cuántos días de anticipación salió este aviso.
  days_before integer not null,
  sent_at timestamptz not null default now(),
  unique (subscription_id, period_end, days_before)
);

create index if not exists renewal_reminders_user_idx
  on renewal_reminders (user_id, sent_at desc);

comment on table renewal_reminders is
  'Un renglon por aviso de renovacion enviado. La restriccion unica es lo que impide mandarlo dos veces.';

-- Cerrada por omisión: la escribe el cron con el service role y solo el comité
-- necesita poder consultarla.
alter table renewal_reminders enable row level security;

drop policy if exists "recordatorios renovacion admin read" on renewal_reminders;
create policy "recordatorios renovacion admin read" on renewal_reminders
  for select using (public.is_admin());

-- Sin esto PostgREST no ve la tabla nueva y toda consulta falla con 400, que en
-- pantalla se lee como "no hay datos" y no como error.
notify pgrst, 'reload schema';
