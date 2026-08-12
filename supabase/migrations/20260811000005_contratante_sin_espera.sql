-- Reglas de espera corregidas por la PM el 11-ago-2026:
--
--   1. El CONTRATANTE no tiene período de espera: quien compra la membresía se
--      vuelve miembro automáticamente, sin aprobación ni espera.
--   2. El REEMPLAZO ya no tiene días propios (antes 180 fijos): se evalúa con
--      las condiciones normales (120/150/180 según adopción y raza), solo que
--      SIN el beneficio del código de embajador.
--
-- Igual que con la edad senior (migración ...004), estas dos llaves salen del
-- sistema de beneficios versionados para que ningún lector futuro encuentre
-- valores congelados que contradigan la regla:

update public.plan_versions
   set benefits = benefits - 'espera_contratante_dias' - 'espera_mascota_reemplazo_dias'
 where benefits ? 'espera_contratante_dias'
    or benefits ? 'espera_mascota_reemplazo_dias';

update public.subscriptions
   set benefits_snapshot = benefits_snapshot - 'espera_contratante_dias' - 'espera_mascota_reemplazo_dias'
 where benefits_snapshot ? 'espera_contratante_dias'
    or benefits_snapshot ? 'espera_mascota_reemplazo_dias';

-- `profiles.waiting_period_end_date` NO se toca: queda como columna huérfana
-- con las fechas viejas (sin backfill, decisión de Pablo). El webhook dejó de
-- escribirla y ya nadie la lee.

notify pgrst, 'reload schema';
