-- Membresía $599 · Sección 6: garantía de 90 días y mes gratis (17-sep-2026).
--
-- GARANTÍA: «si en los primeros tres meses no te convence, te devolvemos lo
-- que hayas pagado, menos lo que ya te hayamos reembolsado». Decisión del
-- equipo: el sistema CALCULA y el equipo CONFIRMA. Se pide por peludo (cada
-- peludo tiene su membresía). Al confirmar se reembolsa en Stripe y se
-- cancela esa membresía.
--
-- MES GRATIS: «si nos tardamos más de 5 días hábiles, tu mes es gratis». El
-- sistema detecta el vencimiento (sección 3) y el equipo lo aplica con un
-- botón: un crédito en el saldo del cliente de Stripe por un mes de ese
-- peludo, que se descuenta solo en su siguiente cobro.

create table if not exists guarantee_requests (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  subscription_id   uuid not null references subscriptions(id) on delete cascade,
  pet_id            uuid references pets(id) on delete set null,
  paid_cents        int not null,
  reimbursed_cents  int not null,
  refund_cents      int not null,
  status            text not null default 'pendiente'
                      check (status in ('pendiente', 'reembolsada', 'rechazada')),
  member_comment    text,
  team_notes        text,
  stripe_refund_ids text[],
  requested_at      timestamptz not null default now(),
  resolved_by       uuid references profiles(id),
  resolved_at       timestamptz
);

-- Una sola solicitud viva por membresía.
create unique index if not exists uq_garantia_pendiente
  on guarantee_requests(subscription_id) where status = 'pendiente';

alter table guarantee_requests enable row level security;
drop policy if exists "garantias propias" on guarantee_requests;
create policy "garantias propias" on guarantee_requests for select
  using (user_id = auth.uid());

alter table reimbursements
  add column if not exists free_month_applied_at timestamptz,
  add column if not exists free_month_cents      int,
  add column if not exists free_month_stripe_ref text,
  add column if not exists free_month_applied_by uuid references profiles(id);

notify pgrst, 'reload schema';
