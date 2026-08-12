-- El período de espera arranca cuando el COMITÉ APRUEBA la mascota, no cuando
-- se registra (regla confirmada por la PM el 11-ago).
--
-- Además arregla la familia del bug "13 días transcurridos": la pantalla
-- derivaba el inicio de `created_at` porque nunca se guardó un inicio real.
-- Si el pago (que era quien fijaba la fecha fin) llegaba N días después de
-- crear la ficha, la mascota nacía con N días "transcurridos" fantasma.
--
-- Sin backfill (decisión de Pablo): las mascotas ya aprobadas conservan sus
-- fechas; la pantalla usa `created_at` como respaldo para ellas.

alter table public.pets
  add column if not exists waiting_period_start_date date;

comment on column public.pets.waiting_period_start_date is
  'Inicio real de la espera: el día (hora CDMX) en que el comité aprobó la ficha. Null en mascotas aprobadas antes del 11-ago-2026 (la UI usa created_at como respaldo).';

notify pgrst, 'reload schema';
