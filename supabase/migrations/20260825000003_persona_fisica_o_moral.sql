-- Persona física o moral en embajadores y centros (equipo, 19-ago)
--
-- Hasta hoy los dos formularios daban por hecho que quien se da de alta es una
-- persona. En la práctica muchos centros son una sociedad, y el convenio se
-- firma —y las comisiones se pagan— a nombre de la razón social.
--
-- LAS DECISIONES QUE ESTO IMPLEMENTA (documento del 19-ago):
--  1.1  RFC (constancia de situación fiscal) basta como base; nada de acta
--       constitutiva en el alta.
--  1.2  La CURP y los 18+ se piden DEL REPRESENTANTE LEGAL.
--  1.3  Aplica a los DOS: embajadores y centros.
--  1.4  La CLABE es libre; el comité revisa que cuadre con la razón social.
--  1.5  La revisión es DOCUMENTO POR DOCUMENTO, no todo junto.

-- ===== 1. Tipo de persona, razón social y RFC =====
--
-- `default 'fisica'` para no tocar a los 50 embajadores y 12 centros que ya
-- están: todos ellos son personas físicas y así siguen sin migración de datos.
--
-- OJO CON LO QUE SIGNIFICAN LAS COLUMNAS DE PERSONA cuando `tipo_persona` es
-- 'moral': `first_name`, `last_name`, `curp` y `birth_date` describen al
-- REPRESENTANTE LEGAL, no a la entidad. La entidad vive en `razon_social` y
-- `rfc`. Se reusan a propósito en vez de duplicar media tabla: es exactamente
-- la misma información que el formulario ya pedía, y así el panel, el corte de
-- comisiones y la validación de edad siguen leyendo de donde siempre.

alter table ambassadors
  add column if not exists tipo_persona text not null default 'fisica',
  add column if not exists razon_social text;
-- `ambassadors.rfc` ya existía (tarjeta de datos de pago, 13-ago). En una
-- persona moral guarda el RFC de la entidad; en una física, el de la persona.

alter table wellness_centers
  add column if not exists tipo_persona text not null default 'fisica',
  add column if not exists razon_social text,
  add column if not exists rfc text,
  -- Los centros NO pedían ni CURP ni fecha de nacimiento de nadie: se validaba
  -- a quien comparte un código y no al negocio al que se manda a los miembros.
  add column if not exists curp varchar(18),
  add column if not exists birth_date date;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ambassadors_tipo_persona_check') then
    alter table ambassadors
      add constraint ambassadors_tipo_persona_check
      check (tipo_persona in ('fisica','moral'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'wellness_centers_tipo_persona_check') then
    alter table wellness_centers
      add constraint wellness_centers_tipo_persona_check
      check (tipo_persona in ('fisica','moral'));
  end if;
end $$;

comment on column ambassadors.tipo_persona is
  'fisica | moral. En moral, first_name/last_name/curp/birth_date/ine_*_url son del REPRESENTANTE LEGAL';
comment on column wellness_centers.tipo_persona is
  'fisica | moral. En moral, contact_name/curp/birth_date son del REPRESENTANTE LEGAL';

-- ===== 2. `documents` pasa a ser el expediente de las solicitudes =====
--
-- La tabla existía para los documentos del MIEMBRO (INE, comprobante, facturas)
-- y siempre colgaba de `user_id`, o de `pet_id`. Ahora también guarda los de
-- una solicitud de embajador o de centro, así que necesita saber a cuál.
alter table documents
  add column if not exists ambassador_id uuid references ambassadors(id) on delete cascade,
  add column if not exists center_id uuid references wellness_centers(id) on delete cascade;

-- Revisión DOCUMENTO POR DOCUMENTO (decisión 1.5). Antes aprobar era una sola
-- decisión sobre toda la solicitud; el comité tiene que poder dar por bueno el
-- RFC y dejar pendiente la INE del representante.
alter table documents
  add column if not exists status text not null default 'pendiente',
  add column if not exists reviewed_by uuid references profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_notes text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'documents_status_check') then
    alter table documents
      add constraint documents_status_check
      check (status in ('pendiente','aprobado','denegado'));
  end if;
end $$;

comment on column documents.status is
  'pendiente | aprobado | denegado — la revisión es por documento, no por solicitud (equipo 19-ago)';

create index if not exists idx_documents_ambassador on documents(ambassador_id);
create index if not exists idx_documents_center on documents(center_id);

-- ===== 3. La INE del embajador se copia al expediente =====
--
-- Vivía SOLO en `ambassadors.ine_front_url` / `ine_back_url`. Esas columnas se
-- conservan y se siguen escribiendo —el panel y el portal las leen— pero además
-- cada lado queda como su propio renglón en `documents` para que entre en la
-- revisión documento por documento junto al RFC.
--
-- Solo los que tienen cuenta: `documents.user_id` es NOT NULL. Hoy en la base
-- los 20 embajadores con INE tienen cuenta, así que no se pierde ninguno; los
-- 2 sin cuenta tampoco tienen INE.
insert into documents (user_id, ambassador_id, document_type, file_path, file_name, status)
select a.user_id, a.id, 'ine_front', a.ine_front_url, 'INE (frente)', 'pendiente'
from ambassadors a
where a.user_id is not null
  and a.ine_front_url is not null
  and not exists (
    select 1 from documents d
    where d.ambassador_id = a.id and d.document_type = 'ine_front'
  );

insert into documents (user_id, ambassador_id, document_type, file_path, file_name, status)
select a.user_id, a.id, 'ine_back', a.ine_back_url, 'INE (reverso)', 'pendiente'
from ambassadors a
where a.user_id is not null
  and a.ine_back_url is not null
  and not exists (
    select 1 from documents d
    where d.ambassador_id = a.id and d.document_type = 'ine_back'
  );

-- Los ya aprobados nacen aprobados: el comité ya los revisó, y estrenar la
-- pantalla con veinte documentos "pendientes" de gente activa sería una cola
-- falsa que alguien tendría que vaciar a mano.
update documents d
set status = 'aprobado'
from ambassadors a
where d.ambassador_id = a.id
  and a.status = 'approved'
  and d.status = 'pendiente';

-- Agrega columnas: sin esto PostgREST se queda con el esquema viejo y las
-- consultas que las piden fallan con 400, que se lee como "no hay datos".
notify pgrst, 'reload schema';
