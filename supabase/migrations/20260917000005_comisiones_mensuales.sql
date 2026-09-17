-- Membresía $599 · Sección 5: comisión mensual del embajador (17-sep-2026).
--
-- En el $159 el embajador cobra una sola vez por referido ($16/$170, en
-- `referrals.commission_amount`), y así sigue. En el $599 cobra el 3% de CADA
-- mes pagado del PRIMER peludo de su referido (decisión del equipo). Un pago
-- anual se reparte en 12 meses. Cada mes es una fila aquí, ligada al referido
-- y a la factura de Stripe que lo generó.
--
-- Las reglas del corte no cambian y aplican igual a estas filas:
--   · se paga el mes ya cerrado (earned_on antes del día 1 del mes en curso);
--   · a quien se dio de baja, solo lo cobrado por la pasarela ANTES de su baja
--     (paid_at <= deactivated_at).

create table if not exists referral_commissions (
  id                uuid primary key default gen_random_uuid(),
  referral_id       uuid not null references referrals(id) on delete cascade,
  ambassador_id     uuid not null references ambassadors(id) on delete cascade,
  subscription_id   uuid references subscriptions(id) on delete set null,
  stripe_invoice_id text not null,
  -- El mes al que corresponde (día 1 del mes de ese período).
  earned_on         date not null,
  -- Cuándo lo cobró la pasarela: decide si cuenta para quien se dio de baja.
  paid_at           timestamptz not null,
  base_cents        int not null,
  percentage        numeric(5,2) not null,
  amount            numeric(10,2) not null,
  status            text not null default 'pending' check (status in ('pending', 'paid', 'void')),
  payout_id         uuid references ambassador_payouts(id) on delete set null,
  created_at        timestamptz not null default now(),
  unique (stripe_invoice_id, earned_on)
);

create index if not exists idx_referral_commissions_corte
  on referral_commissions(ambassador_id, status, earned_on);

alter table referral_commissions enable row level security;

-- El embajador ve las suyas; todo lo demás lo escribe el servidor.
drop policy if exists "comisiones propias" on referral_commissions;
create policy "comisiones propias" on referral_commissions for select
  using (exists (
    select 1 from ambassadors a
    where a.id = referral_commissions.ambassador_id and a.user_id = auth.uid()
  ));

notify pgrst, 'reload schema';
