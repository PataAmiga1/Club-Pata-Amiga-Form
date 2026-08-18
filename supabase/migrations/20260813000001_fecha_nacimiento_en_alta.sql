-- Fecha de nacimiento capturada en el ALTA (equipo, 13-ago)
--
-- El registro de miembro ahora pide la fecha de nacimiento y no deja crear la
-- cuenta si no hay 18 años cumplidos. El disparador que crea el perfil solo
-- copiaba nombre y teléfono de los metadatos, así que ese dato se perdía y la
-- persona tenía que volver a escribirlo en "Completa tu perfil".
--
-- Se castea con ::date dentro de un bloque tolerante: si por lo que sea llega
-- un valor que no es fecha (una cuenta creada por Google, por ejemplo, que no
-- trae el campo), el perfil se crea igual y el dato queda nulo. Un alta que
-- falla aquí dejaría a alguien sin poder entrar.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  fecha date;
begin
  begin
    fecha := nullif(new.raw_user_meta_data->>'birth_date', '')::date;
  exception when others then
    fecha := null;
  end;

  insert into public.profiles (id, email, first_name, phone, birth_date)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'first_name', new.raw_user_meta_data->>'full_name'),
    new.raw_user_meta_data->>'phone',
    fecha
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
