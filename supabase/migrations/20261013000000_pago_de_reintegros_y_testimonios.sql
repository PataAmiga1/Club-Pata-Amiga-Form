-- Registrar el pago de un reintegro + pedir testimonio («casos de éxito»)
-- (13-oct-2026)
--
-- 1. PAGO. Hasta hoy ninguna acción del panel ponía un reintegro en `paid`.
--    Consecuencias: el layout del banco volvía a exportar los mismos aprobados
--    (riesgo de pagar dos veces) y el cron del plazo de 5 días hábiles marcaba
--    TODO como vencido (mes gratis). `paid_at` y `total_paid_amount` ya
--    existían; faltaba quién lo registró, la clave de rastreo SPEI y una nota.
--
-- 2. TESTIMONIO. Cuando un reintegro queda pagado, se le pide al miembro un
--    testimonio UNA vez por miembro (no por reintegro). La garantía es la
--    restricción única de `user_id`, no el código (mismo patrón que
--    `member_reminders`): se inserta primero y se manda después.

alter table reimbursements
  add column if not exists payment_reference text,
  add column if not exists payment_note text,
  add column if not exists paid_by uuid references profiles(id) on delete set null;

comment on column reimbursements.payment_reference is
  'Clave de rastreo SPEI (o referencia del banco) del depósito al miembro. Se captura al registrar el pago.';
comment on column reimbursements.paid_by is
  'Admin que registró el pago. NULL en pagos anteriores al 13-oct-2026.';

create table if not exists testimonial_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references profiles(id) on delete cascade,
  reimbursement_id uuid references reimbursements(id) on delete set null,
  -- 'testimonial_request' | 'testimonial_request_despedida'
  template_key text not null,
  sent_at timestamptz not null default now(),
  -- NULL = lo mandó el cron; si no, el admin que apretó «Pedir testimonio».
  sent_by uuid references profiles(id) on delete set null,
  auto boolean not null default false,
  -- false si Resend rechazó el correo (queda el renglón: no se reintenta solo).
  email_ok boolean,
  constraint testimonial_requests_una_por_miembro unique (user_id)
);

create index if not exists testimonial_requests_reimbursement_idx
  on testimonial_requests(reimbursement_id);

comment on table testimonial_requests is
  'Un renglón por miembro al que se le pidió testimonio tras un reintegro pagado. La restricción única de user_id impide pedirlo dos veces.';

-- Cerrada por omisión: la escribe el servidor con el service role; solo el
-- comité la consulta.
alter table testimonial_requests enable row level security;

drop policy if exists "testimonios admin read" on testimonial_requests;
create policy "testimonios admin read" on testimonial_requests
  for select using (public.is_admin());

notify pgrst, 'reload schema';
