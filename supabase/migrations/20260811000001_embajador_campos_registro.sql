-- Campos que faltaban en la solicitud de embajador (observaciones 10/11-ago).
--
-- Contexto: hasta ahora el formulario pedía "Apellidos" en un solo campo y no
-- pedía código postal. El equipo pidió separar apellido paterno y materno, y
-- que el CP autocomplete colonia y alcaldía/municipio (editable, por si el
-- catálogo se equivoca).
--
-- Se AGREGAN columnas nuevas en vez de partir `last_name`: ya hay ~50 filas
-- reales y no se puede adivinar dónde termina el paterno y empieza el materno.
-- `last_name` se queda como APELLIDO PATERNO y lo existente no se toca.

alter table public.ambassadors
  add column if not exists second_last_name text,
  add column if not exists postal_code      varchar(5),
  add column if not exists colony           text;

comment on column public.ambassadors.last_name is
  'Apellido paterno. Antes guardaba "Apellidos" completos (filas previas al 11-ago).';
comment on column public.ambassadors.second_last_name is
  'Apellido materno (equipo, 11-ago). Null en las solicitudes anteriores.';
comment on column public.ambassadors.postal_code is
  'CP de 5 dígitos; autocompleta colonia y alcaldía/municipio vía /api/sepomex.';
comment on column public.ambassadors.colony is
  'Colonia. `city` guarda la alcaldía o municipio, según el caso.';

-- PostgREST no ve las columnas nuevas hasta que se le avisa.
notify pgrst, 'reload schema';
