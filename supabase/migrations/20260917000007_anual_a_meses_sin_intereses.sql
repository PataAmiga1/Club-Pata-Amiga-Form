-- Membresía $599 · Anual a meses sin intereses (17-sep-2026, decisión de Pablo).
--
-- Stripe NO permite meses sin intereses dentro de una suscripción: solo en un
-- pago único. Así que el año se cobra como UN pago (con MSI si la tarjeta lo
-- permite) y la suscripción se crea con el primer cobro programado a 12 meses,
-- para que la renovación exista y nadie se quede sin membresía por olvido.
--
-- Mientras ese año está pagado por adelantado, la suscripción vive en Stripe
-- como `trialing`: no cobra nada hasta el aniversario.

alter table subscriptions
  add column if not exists anual_prepagado boolean not null default false,
  add column if not exists msi_meses smallint
    check (msi_meses is null or msi_meses between 2 and 24);

comment on column subscriptions.anual_prepagado is
  'El año en curso se pagó de una sola vez (fuera de la suscripción). La suscripción solo sirve para renovar: cobra hasta el aniversario.';
comment on column subscriptions.msi_meses is
  'En cuántos meses sin intereses quedó ese pago (3 o 6). NULL = se pagó en una exhibición.';

notify pgrst, 'reload schema';
