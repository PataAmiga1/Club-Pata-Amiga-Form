-- Observaciones del equipo (5-ago-2026) — campos nuevos
--
-- 1) Embajadores: fecha de nacimiento, RFC, motivación y redes sociales los
--    captura el propio embajador (solicitud / Mi cuenta); el admin solo los ve
--    (sensibles → super admin). Baja de embajador usa el valor 'canceled' que
--    el enum ya tenía, más el rastro de cuándo y por qué.
-- 2) Centros: valor 'deactivated' para bajas (voluntarias o del comité) y
--    redes sociales del centro.
-- 3) Perfiles: nacionalidad (obligatoria para perfil completo, decisión de
--    Pablo 5-ago; el cruce con CURP solo marca, no bloquea).

alter table ambassadors
  add column if not exists birth_date date,
  add column if not exists rfc text,
  add column if not exists motivation text,
  add column if not exists social_links jsonb not null default '{}'::jsonb,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivation_reason text;

alter table wellness_centers
  add column if not exists social_links jsonb not null default '{}'::jsonb,
  add column if not exists deactivated_at timestamptz,
  add column if not exists deactivation_reason text;

alter type wellness_status add value if not exists 'deactivated';

alter table profiles
  add column if not exists nationality text;
