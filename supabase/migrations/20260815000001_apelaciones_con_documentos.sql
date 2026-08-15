-- Apelaciones con documentos (equipo, 15-ago)
--
-- Hasta hoy una apelación era SOLO TEXTO. El equipo lo dijo con el caso que lo
-- vuelve evidente: si al comité no le convenció la foto del peludo, la persona
-- no tiene forma de mandar otra — puede explicar por escrito que su perro sí es
-- un Pastor Blanco Suizo, pero no adjuntar la foto que lo demuestra. Así la
-- apelación nace condenada y el comité vuelve a resolver con lo mismo que ya
-- había rechazado.
--
-- `documents` guarda [{path, name, type}], igual que en `reimbursements`, para
-- que el panel los lea con el mismo patrón.

alter table appeals
  add column if not exists documents jsonb not null default '[]'::jsonb;

comment on column appeals.documents is
  'Adjuntos de la apelación: [{path, name, type}] dentro del bucket appeal-documents';

-- Bucket propio y PRIVADO. No se reusa `reimbursement-invoices` porque una
-- apelación de mascota no es una factura, y mezclarlas volvería imposible
-- responder después "qué subió esta persona y para qué".
insert into storage.buckets (id, name, public)
values ('appeal-documents', 'appeal-documents', false)
on conflict (id) do nothing;

-- Mismas reglas que el resto de buckets privados: cada quien escribe y lee
-- dentro de la carpeta con su propio id, y el comité lo ve todo.
drop policy if exists "appeal docs upload" on storage.objects;
create policy "appeal docs upload" on storage.objects
  for insert
  with check (
    bucket_id = 'appeal-documents'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "appeal docs read" on storage.objects;
create policy "appeal docs read" on storage.objects
  for select
  using (
    bucket_id = 'appeal-documents'
    and ((auth.uid())::text = (storage.foldername(name))[1] or public.is_admin())
  );
