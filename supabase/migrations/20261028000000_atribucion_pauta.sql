-- Atribución de pauta (28-oct-2026): de qué anuncio/campaña llegó cada miembro.
--
-- Aditiva: una columna nueva, nula, sin valor por omisión. Nada existente cambia.
--
-- La escribe SOLO el servidor (llave de servicio) al crear la cuenta, desde la
-- cookie propia `pa_origen` (src/lib/atribucion.ts), y solo si la persona
-- aceptó cookies de marketing. Forma:
--   { "primero": Toque, "ultimo": Toque, "guardada": "<ISO>" }
--   Toque = { ts, utm_source?, utm_medium?, utm_campaign?, utm_content?,
--             utm_term?, fbclid?, gclid?, pagina?, referente? }
-- Se lee en /ventas/contactos/[id] y /admin/miembros/[id] como «Origen».

alter table public.profiles
  add column if not exists attribution jsonb;

comment on column public.profiles.attribution is
  'Atribución de pauta (utm_*/fbclid/gclid): primer y último toque antes de crear la cuenta. Solo la escribe el servidor (service_role); un miembro no puede cambiarla (trigger profiles_proteger_atribucion).';

-- RLS: la política «own profile update» deja al miembro actualizar SU fila
-- completa. Para que no pueda inventarse (o borrarse) la atribución, este
-- trigger conserva el valor anterior cuando quien actualiza es un usuario
-- con sesión (authenticated/anon). En silencio, sin error: así una
-- actualización legítima del perfil que mande la fila entera no falla.
-- La llave de servicio y el SQL del panel (sin JWT) sí pueden escribirla.
create or replace function public.proteger_atribucion_de_perfil()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.attribution is distinct from old.attribution
     and coalesce(auth.role(), '') in ('authenticated', 'anon') then
    new.attribution := old.attribution;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_proteger_atribucion on public.profiles;
create trigger profiles_proteger_atribucion
  before update on public.profiles
  for each row
  execute function public.proteger_atribucion_de_perfil();

notify pgrst, 'reload schema';
