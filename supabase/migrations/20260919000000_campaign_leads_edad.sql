-- Landing de ExpoCan (19-sep-2026): el equipo pidió la edad de la persona que
-- deja sus datos. Solo la llenan las landings que la preguntan
-- (campos.edad en src/lib/landings.ts); las demás la dejan vacía.
alter table campaign_leads add column if not exists age smallint
  check (age is null or age between 18 and 110);

notify pgrst, 'reload schema';
