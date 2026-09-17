-- Membresía $599 · Sección 1: el producto en la base (17-sep-2026).
-- Especificación: juntas/64 §4d.
--
-- Qué crea:
--   1. Precio del peludo adicional en cada versión (15% menos).
--   2. El plan `membresia-599` con su v1 mensual y anual EN BORRADOR, sin
--      Stripe y sin papel legal: no se vende nada. Se publica en la sección 9,
--      con los textos del despacho.
--   3. El catálogo cerrado de cuidados cotidianos (4 grupos), editable desde
--      el panel. Público para lectura: se muestra antes de pagar.
--
-- No toca a nadie del $159: no cambia sus versiones ni sus fotos de beneficios.

-- ------------------------------------------- 1. precio del peludo adicional

alter table plan_versions
  add column if not exists additional_price_cents int,
  add column if not exists stripe_additional_price_id text;

comment on column plan_versions.additional_price_cents is
  'Precio de cada peludo después del primero (membresía $599: 15% menos). NULL = el plan no cobra por peludo.';

-- ------------------------------------------------ 2. plan y versiones v1

insert into membership_plans (slug, name, description, is_public, position)
values ('membresia-599', 'Membresía Pata Amiga $599',
        'Por peludo: cuidados cotidianos, emergencia veterinaria y despedida, con montos que crecen mientras permaneces.',
        false, 1)
on conflict (slug) do nothing;

-- `benefits` guarda SOLO las diferencias contra el catálogo (que por omisión
-- son las reglas del $159). Generado desde el código contra el catálogo de 29
-- llaves, no escrito a mano.
insert into plan_versions
  (plan_id, version, interval, price_cents, additional_price_cents, benefits, status, notes)
select p.id, 1, v.interval, v.precio, v.adicional,
  '{"espera_mascota_estandar_dias":30,"espera_mascota_adoptada_raza_dias":30,"espera_mascota_adoptada_mestizo_dias":30,"espera_mascota_con_embajador_dias":30,"tope_gastos_veterinarios_mxn":0,"tope_fallecimiento_mxn":0,"tope_vacunas_mxn":0,"horas_compromiso_reintegro":0,"mascotas_activas_max":1,"comision_embajador_mensual_mxn":0,"comision_embajador_anual_mxn":0,"montos_crecientes":true,"cuidados_apertura_dias":31,"cuidados_monto_inicial_mxn":500,"cuidados_tope_anual_mxn":2000,"cuidados_meses_al_tope":12,"emergencia_apertura_mes":7,"emergencia_monto_inicial_mxn":30000,"emergencia_tope_anual_mxn":60000,"emergencia_meses_al_tope":36,"despedida_monto_anual_mxn":2000,"despedida_apertura_dias":31,"dias_habiles_reintegro":5,"garantia_dias":90,"certificado_senior_al_inscribir":true,"aviso_reintegro_mayor_a_mxn":8000,"comision_embajador_porcentaje":3}'::jsonb,
  'borrador',
  'Sección 1 (17-sep-2026): especificación juntas/64 §4d. Borrador hasta tener los textos legales del despacho.'
from membership_plans p,
(values ('month', 59900, 50900), ('year', 661200, 562000)) as v(interval, precio, adicional)
where p.slug = 'membresia-599'
on conflict (plan_id, version, interval) do nothing;

-- --------------------------------------- 3. catálogo de cuidados cotidianos

create table if not exists care_catalog_groups (
  id         uuid primary key default gen_random_uuid(),
  position   int not null unique,
  title      text not null,
  created_at timestamptz not null default now()
);

create table if not exists care_catalog_items (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references care_catalog_groups(id) on delete cascade,
  position   int not null,
  name       text not null,
  -- Nunca se borra: se desactiva. Un reintegro viejo puede citar el concepto.
  active     boolean not null default true,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, name)
);

create index if not exists idx_care_catalog_items_group
  on care_catalog_items(group_id, position);

alter table care_catalog_groups enable row level security;
alter table care_catalog_items  enable row level security;

-- Lectura pública: el catálogo se enseña antes de pagar. Escribir, solo el
-- servidor (service role) después de comprobar el rol en la server action.
drop policy if exists "catalogo grupos publico" on care_catalog_groups;
create policy "catalogo grupos publico" on care_catalog_groups for select using (true);
drop policy if exists "catalogo conceptos activos" on care_catalog_items;
create policy "catalogo conceptos activos" on care_catalog_items for select using (active);

insert into care_catalog_groups (position, title) values
  (1, 'Que no se enferme de lo que sí se puede evitar'),
  (2, 'Que se lo detecten y se lo atiendan a tiempo'),
  (3, 'Que la boca no le acorte la vida'),
  (4, 'Que llegue sano a viejo')
on conflict (position) do nothing;

insert into care_catalog_items (group_id, position, name)
select g.id, i.pos, i.nombre
from care_catalog_groups g
join (values
  (1, 1, 'Vacunas'),
  (1, 2, 'Desparasitación interna y externa'),
  (1, 3, 'Prevención del gusano del corazón'),
  (1, 4, 'Uroanálisis completo y sedimento urinario (prevención renal y urinaria, principalmente en gatos)'),
  (2, 1, 'Consultas'),
  (2, 2, 'Estudios de sangre, orina y heces'),
  (2, 3, 'Pruebas de detección rápida'),
  (2, 4, 'Ultrasonido preventivo'),
  (2, 5, 'Citologías y raspados de piel/oídos'),
  (2, 6, 'Medicamentos recetados'),
  (2, 7, 'Higiene médica preventiva (limpieza de oídos, vaciado de glándulas anales, corte de uñas)'),
  (2, 8, 'Examen de presión intraocular especialmente en gatos'),
  (3, 1, 'Valoración oral'),
  (3, 2, 'Limpieza dental con ultrasonido'),
  (3, 3, 'Extracciones'),
  (4, 1, 'Esterilización'),
  (4, 2, 'Revisiones postquirúrgicas y retiro de puntos'),
  (4, 3, 'Asesoría nutricional'),
  (4, 4, 'Control de peso'),
  (4, 5, 'Chequeo senior (incluyendo ultrasonido, radiografías de control, perfil geriátrico, medición de presión arterial y presión intraocular)'),
  (4, 6, 'Perfil tiroideo (T4) en gatos')
) as i(grupo, pos, nombre) on i.grupo = g.position
on conflict (group_id, name) do nothing;

notify pgrst, 'reload schema';
