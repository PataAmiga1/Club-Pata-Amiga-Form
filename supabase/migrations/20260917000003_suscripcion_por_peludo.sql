-- Membresía $599 · Sección 2: una suscripción por peludo (17-sep-2026).
--
-- En el $599 cada peludo tiene SU suscripción en Stripe («juntas pero no
-- revueltas»): el más antiguo activo paga el precio principal ($599) y los
-- demás el adicional ($509). Las suscripciones del $159 no tienen peludo:
-- `pet_id` y `price_tier` se quedan en NULL y nada cambia para ellas.

alter table subscriptions
  add column if not exists pet_id uuid references pets(id) on delete set null,
  add column if not exists price_tier text
    check (price_tier is null or price_tier in ('principal', 'adicional'));

comment on column subscriptions.pet_id is
  'Membresía $599: el peludo que cubre esta suscripción. NULL = membresía $159 (cubre hasta 3 peludos de la cuenta).';
comment on column subscriptions.price_tier is
  'Membresía $599: principal ($599, el peludo más antiguo activo) o adicional ($509). NULL en el $159.';

-- Un peludo no puede tener dos suscripciones vivas: sería cobrarle doble.
create unique index if not exists uq_subscriptions_peludo_vivo
  on subscriptions(pet_id)
  where pet_id is not null and status not in ('canceled', 'incomplete_expired');

-- Libro de cobros: una fila por factura pagada en Stripe. De aquí salen los
-- «meses pagados» que hacen crecer los montos (sección 3) y las comisiones
-- mensuales del embajador (sección 5). Se liga por el id de Stripe y no por
-- llave foránea: `invoice.paid` puede llegar ANTES que `checkout.session.completed`.
create table if not exists subscription_payments (
  id                     uuid primary key default gen_random_uuid(),
  stripe_invoice_id      text not null unique,
  stripe_subscription_id text not null,
  amount_paid_cents      int not null,
  currency               text not null default 'MXN',
  period_start           timestamptz,
  period_end             timestamptz,
  billing_reason         text,
  paid_at                timestamptz not null default now(),
  created_at             timestamptz not null default now()
);

create index if not exists idx_subscription_payments_sub
  on subscription_payments(stripe_subscription_id, period_start);

alter table subscription_payments enable row level security;

drop policy if exists "cobros propios" on subscription_payments;
create policy "cobros propios" on subscription_payments for select
  using (exists (
    select 1 from subscriptions s
    where s.stripe_subscription_id = subscription_payments.stripe_subscription_id
      and s.user_id = auth.uid()
  ));

notify pgrst, 'reload schema';
