-- Foto de perfil del miembro (anexo A2, equipo 11-ago): el equipo marcó el
-- círculo de "edición de información personal" pidiendo que, si es una foto
-- de perfil, el usuario pueda agregarla. Es OPCIONAL y no cuenta para el 100%
-- del perfil (mismo criterio que el INE del 10-ago: pedir de más frena).
--
-- Bucket público de lectura (el avatar se pinta en encabezados y menús, igual
-- que pet-photos); escritura solo en la carpeta propia (auth.uid()).
-- Aplicada a staging por SQL Editor el 12-ago.

alter table public.profiles
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

drop policy if exists "avatar propio insert" on storage.objects;
create policy "avatar propio insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatar propio update" on storage.objects;
create policy "avatar propio update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "avatars lectura pública" on storage.objects;
create policy "avatars lectura pública" on storage.objects
  for select using (bucket_id = 'avatars');

notify pgrst, 'reload schema';
