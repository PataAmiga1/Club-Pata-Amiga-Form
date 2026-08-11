-- Senior a los 8 años como REGLA GLOBAL (equipo + Regla X de Pablo, 11-ago).
--
-- La edad senior deja de ser un beneficio versionado: aplica a cualquier
-- mascota registrada desde el cambio, sin importar cuándo contrató el miembro.
-- El valor vive SOLO en el código (SENIOR_PET_AGE_YEARS = 8) y la llave
-- `edad_senior_anios` se quitó del catálogo de beneficios.
--
-- Esta migración limpia la llave de los datos para que ningún lector futuro
-- encuentre un "10" congelado y contradiga la regla:
--   · plan_versions.benefits          (definición por versión de plan)
--   · subscriptions.benefits_snapshot (foto contratada por cada suscripción)
--
-- NO toca ninguna mascota: `pets.is_senior` guardado se queda como está
-- (sin recálculo retroactivo, decisión de Pablo).

update public.plan_versions
   set benefits = benefits - 'edad_senior_anios'
 where benefits ? 'edad_senior_anios';

update public.subscriptions
   set benefits_snapshot = benefits_snapshot - 'edad_senior_anios'
 where benefits_snapshot ? 'edad_senior_anios';

notify pgrst, 'reload schema';
