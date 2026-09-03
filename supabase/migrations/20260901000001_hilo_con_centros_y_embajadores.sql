-- Hilo del comité con centros aliados y con embajadores (Cipatli, 1-sep)
--
-- LO QUE FALTABA. El comité podía pedirle información a un MIEMBRO por el hilo
-- de su peludo y por el de su reintegro, con adjuntos desde el 19-ago. Con un
-- embajador o con un centro no tenía por dónde: si la INE llegaba borrosa —el
-- ejemplo que dio Cipatli— la única salida era aprobar a ciegas, denegar sin
-- avisar, o salirse de la plataforma a escribir un correo que después nadie
-- podía consultar junto a la solicitud.
--
-- UNA SOLA TABLA PARA LOS DOS, no una por cada uno. Es el mismo grano que ya
-- eligió la fase 5 el 25-ago, cuando `documents` estrenó `ambassador_id` y
-- `center_id` en vez de partirse en dos tablas. Aquí importa más todavía: son
-- el mismo trámite visto por dos puertas, Cipatli los pidió juntos, y con dos
-- tablas serían dos juegos de acciones y dos pantallas que se van separando
-- solas con cada arreglo que se le hace a una y no a la otra.
--
-- El resto es `pet_messages` tal cual: quién habla, qué se pide, los adjuntos
-- en `documents` y la bandera de "hay algo pendiente".

create table if not exists solicitud_messages (
  id uuid primary key default gen_random_uuid(),

  -- Exactamente uno de los dos. La restricción de abajo lo obliga: sin ella,
  -- un renglón sin dueño quedaría invisible para siempre y uno con los dos
  -- saldría en dos hilos distintos.
  ambassador_id uuid references ambassadors(id) on delete cascade,
  center_id uuid references wellness_centers(id) on delete cascade,
  constraint solicitud_messages_un_solo_dueno
    check (num_nonnulls(ambassador_id, center_id) = 1),

  -- 'solicitante' y no 'member' a propósito: quien contesta puede no ser
  -- miembro —un centro casi nunca lo es— y llamarle miembro haría que la
  -- pantalla del centro hablara de una membresía que no tiene.
  sender text not null check (sender in ('admin', 'solicitante')),
  author_id uuid references profiles(id),
  message text not null,

  -- Qué pidió el comité, del mismo catálogo de documentos que ya usa el alta:
  -- ine_frente | ine_reverso | curp | rfc_constancia | comprobante_domicilio |
  -- documento. Es texto libre a propósito, igual que en `pet_messages`: el
  -- catálogo vive en el código y ahí se puede crecer sin migrar.
  requested_items text[] not null default '{}',

  -- [{path, name, type}] dentro del bucket privado `conversacion-documentos`,
  -- el mismo de los hilos del miembro. No se crea uno nuevo: es la misma clase
  -- de archivo (lo que alguien manda dentro de una conversación) y separarlo
  -- solo repartiría las mismas fotos en dos lugares.
  documents jsonb not null default '[]'::jsonb,

  created_at timestamptz not null default now()
);

create index if not exists solicitud_messages_ambassador_idx
  on solicitud_messages (ambassador_id, created_at);
create index if not exists solicitud_messages_center_idx
  on solicitud_messages (center_id, created_at);

comment on table solicitud_messages is
  'Hilo del comité con un embajador o un centro aliado. Exactamente uno de ambassador_id / center_id.';
comment on column solicitud_messages.documents is
  'Adjuntos del mensaje: [{path, name, type}] dentro del bucket conversacion-documentos';

-- "Te pedimos algo y no has contestado", igual que `pets.info_requested`. Se
-- prende al pedir y se apaga cuando el solicitante responde. Sirve para el
-- aviso en su portal y para que la cola del comité no se quede esperando algo
-- que nadie sabe que le pidieron.
alter table ambassadors
  add column if not exists info_requested boolean not null default false;
alter table wellness_centers
  add column if not exists info_requested boolean not null default false;

-- RLS ENCENDIDA Y SIN PUERTA PARA EL ANÓNIMO. Las cuatro pantallas leen y
-- escriben con el service role, que se salta RLS: los dos portales resuelven
-- de quién es la solicitud EN CÓDIGO (`ownCenter`, `getAmbassadorContext`),
-- porque un embajador puede haber mandado su solicitud sin sesión y ligarse
-- después por correo — eso una política no lo sabe hacer. Así que aquí solo se
-- deja la lectura del comité; todo lo demás queda cerrado por omisión.
alter table solicitud_messages enable row level security;

drop policy if exists "solicitud messages admin read" on solicitud_messages;
create policy "solicitud messages admin read" on solicitud_messages
  for select using (public.is_admin());

-- Sin esto PostgREST se queda con el esquema viejo y todo lo que consulte la
-- tabla nueva falla con 400, que en pantalla se lee como "no hay datos" y no
-- como error.
notify pgrst, 'reload schema';
