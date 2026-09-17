-- Membresía $599 · Sección 3: reintegros por peludo y por rubro (17-sep-2026).
-- Especificación: juntas/64 §4d.
--
-- 1. Tres categorías nuevas: cuidados cotidianos, emergencia veterinaria y
--    despedida. Las tres del $159 (vet_expenses, death, vaccines) no cambian.
-- 2. Lo que la solicitud congela al momento de pedir: los conceptos del
--    catálogo, el saldo del rubro, el vencimiento en días hábiles y los avisos.
-- 3. Una regla EN LA BASE: las solicitudes del $599 solo entran por el
--    servidor (que calcula el disponible), y un peludo del $599 no puede pedir
--    con las categorías del $159. Sin esto, cualquiera podría insertar desde
--    el navegador saltándose el tope — y aquí hay $60,000 en juego.

-- ALTER TYPE ... ADD VALUE no se puede USAR en la misma transacción, así que
-- abajo las comparaciones van contra `category::text`.
alter type reimbursement_category add value if not exists 'cuidados';
alter type reimbursement_category add value if not exists 'emergencia';
alter type reimbursement_category add value if not exists 'despedida';

alter table reimbursements
  add column if not exists care_concept_ids   uuid[],
  add column if not exists care_concepts      text[],
  add column if not exists plan_balance       jsonb,
  add column if not exists due_business_date  date,
  add column if not exists sla_breached_at    timestamptz,
  add column if not exists high_amount_alert_at timestamptz;

comment on column reimbursements.care_concepts is
  'Membresía $599 · cuidados cotidianos: los conceptos del catálogo como se llamaban al pedir (el catálogo se puede renombrar después).';
comment on column reimbursements.plan_balance is
  'Membresía $599: el saldo del rubro al momento de pedir (monto del año, gastado, disponible, inicio del año del peludo, meses pagados).';
comment on column reimbursements.due_business_date is
  'Membresía $599: último día hábil para depositar (5 días hábiles desde la solicitud). Si se pasa, el mes es gratis.';

create index if not exists idx_reimbursements_vencimiento
  on reimbursements(due_business_date)
  where due_business_date is not null and sla_breached_at is null;

create or replace function public.reintegros_regla_del_plan()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  peludo_599 boolean;
begin
  select exists (
    select 1 from subscriptions s
    where s.pet_id = new.pet_id
      and s.status in ('active', 'past_due', 'unpaid', 'trialing', 'incomplete', 'paused')
  ) into peludo_599;

  if new.category::text in ('cuidados', 'emergencia', 'despedida') then
    if coalesce(auth.role(), '') <> 'service_role' then
      raise exception 'Las solicitudes de la membresía nueva se envían desde la plataforma.'
        using errcode = '42501';
    end if;
    if not peludo_599 then
      raise exception 'Ese peludo no tiene la membresía nueva.' using errcode = '23514';
    end if;
  elsif peludo_599 then
    raise exception 'Ese peludo tiene la membresía nueva: su reintegro va por cuidados cotidianos, emergencia veterinaria o despedida.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists reintegros_regla_del_plan on reimbursements;
create trigger reintegros_regla_del_plan
  before insert on reimbursements
  for each row execute function public.reintegros_regla_del_plan();

notify pgrst, 'reload schema';
