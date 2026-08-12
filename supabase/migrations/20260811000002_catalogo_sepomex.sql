-- Catálogo de códigos postales de SEPOMEX en tabla propia (observaciones 11-ago).
--
-- POR QUÉ: hasta hoy el CP se resolvía contra un espejo gratuito
-- (sepomex.icalialabs.com) que YA NO EXISTE — su dominio ni siquiera resuelve en
-- DNS. Todas las búsquedas caían en `zippopotam`, que NO trae municipio (por eso
-- la alcaldía/municipio nunca se autocompletaba) y devuelve nombres viejos de
-- estado ("Distrito Federal") y sin acentos ("San Angel").
--
-- Fuente: catálogo oficial de Correos de México, versión del 10/08/2026,
-- 159,050 asentamientos. Con él, CP 01000 devuelve:
--   colonia "San Ángel" · alcaldía "Álvaro Obregón" · estado "Ciudad de México"
-- que es exactamente lo que el equipo pidió en las tres observaciones de CP.

create table if not exists public.postal_codes (
  id                bigserial primary key,
  cp                varchar(5) not null,
  colonia           text        not null,
  tipo_asentamiento text,
  -- Alcaldía en CDMX, municipio en el resto. Es UNA sola variable: la etiqueta
  -- del formulario dice "Ciudad, alcaldía o municipio" (equipo, 11-ago).
  municipio         text        not null,
  ciudad            text,
  estado            text        not null,
  zona              text
);

-- La búsqueda SIEMPRE es por CP exacto.
create index if not exists postal_codes_cp_idx on public.postal_codes (cp);

-- Evita duplicados si el import se corre dos veces.
create unique index if not exists postal_codes_cp_colonia_idx
  on public.postal_codes (cp, colonia, municipio);

-- Catálogo público: cualquiera que llene un formulario necesita leerlo.
-- Escribir solo desde el service role (el import).
alter table public.postal_codes enable row level security;

drop policy if exists "postal_codes lectura pública" on public.postal_codes;
create policy "postal_codes lectura pública"
  on public.postal_codes for select
  to anon, authenticated
  using (true);

comment on table public.postal_codes is
  'Catálogo SEPOMEX (Correos de México). Reemplaza a los servicios externos: el espejo que se usaba murió y el respaldo no trae municipio.';

notify pgrst, 'reload schema';
