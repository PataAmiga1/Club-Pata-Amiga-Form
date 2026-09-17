-- Membresía $599 · Sección 0: congelar las reglas de los miembros de $159.
--
-- En producción, 42 suscripciones no tienen foto de beneficios (todas creadas
-- el 2-ago-2026, en la importación del corte, DESPUÉS del respaldo de la
-- migración 20260728000028). Sin foto, sus reglas salen de los valores por
-- omisión del código. Desde la sección 0 esos valores también están
-- congelados (src/lib/plans/planes.ts, BENEFICIOS_PLAN_159), pero la base
-- tiene que contar la historia completa por sí sola: cada suscripción con su
-- versión y su foto.
--
-- Qué hace, SOLO sobre el plan de $159 (`membresia`):
--   1. A quien no tiene versión le asigna la v1 de su intervalo.
--   2. A toda foto le completa las llaves que le falten con los valores
--      congelados. Lo que ya tenía GANA (`congeladas || foto`): nadie pierde
--      ni cambia un valor que ya tenía.
--
-- No cambia la regla efectiva de nadie: los valores que se escriben son
-- exactamente los que el código ya les aplicaba por omisión (verificado el
-- 16-sep contra beneficiosPorOmision()). Es idempotente.

do $$
declare
  congeladas constant jsonb := '{
    "espera_mascota_estandar_dias": 180,
    "espera_mascota_adoptada_raza_dias": 150,
    "espera_mascota_adoptada_mestizo_dias": 120,
    "espera_mascota_con_embajador_dias": 90,
    "tope_gastos_veterinarios_mxn": 3000,
    "tope_fallecimiento_mxn": 2000,
    "tope_vacunas_mxn": 300,
    "horas_compromiso_reintegro": 72,
    "apelaciones_max": 2,
    "mascotas_activas_max": 3,
    "orientacion_vet_24_7": true,
    "comision_embajador_mensual_mxn": 16,
    "comision_embajador_anual_mxn": 170
  }'::jsonb;
  v1_mes uuid;
  v1_anio uuid;
begin
  select pv.id into v1_mes
    from plan_versions pv join membership_plans mp on mp.id = pv.plan_id
   where mp.slug = 'membresia' and pv.version = 1 and pv.interval = 'month';
  select pv.id into v1_anio
    from plan_versions pv join membership_plans mp on mp.id = pv.plan_id
   where mp.slug = 'membresia' and pv.version = 1 and pv.interval = 'year';

  if v1_mes is null or v1_anio is null then
    raise exception 'No existe la v1 mensual/anual del plan membresia: no se congela nada';
  end if;

  -- 1. Versión para quien no tiene. Sin plan conocido no se adivina.
  update subscriptions
     set plan_version_id = case plan when 'annual' then v1_anio else v1_mes end
   where plan_version_id is null
     and plan in ('monthly', 'annual');

  -- 2. Foto completa, solo para suscripciones del plan de $159.
  update subscriptions s
     set benefits_snapshot = congeladas || coalesce(s.benefits_snapshot, '{}'::jsonb),
         benefits_snapshot_at = coalesce(s.benefits_snapshot_at, now())
    from plan_versions pv
    join membership_plans mp on mp.id = pv.plan_id
   where pv.id = s.plan_version_id
     and mp.slug = 'membresia'
     and (s.benefits_snapshot is null
          or not (s.benefits_snapshot ?& array(select jsonb_object_keys(congeladas))));
end $$;
