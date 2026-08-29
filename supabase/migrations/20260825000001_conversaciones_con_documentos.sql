-- Documentos dentro de las conversaciones (equipo, 19-ago — decisión 4.2)
--
-- Los dos hilos con el comité —el de un peludo y el de un reintegro— eran SOLO
-- TEXTO. Es especialmente absurdo en `pet_messages`, que ya tiene
-- `requested_items`: el comité pide "foto principal" o "certificado
-- veterinario" por ese hilo, y el miembro no tenía dónde entregarlos. Tenía que
-- salirse del hilo, ir al perfil y adivinar cuál de los campos era el que le
-- estaban pidiendo.
--
-- Adjuntan LAS DOS PARTES (decisión 4.2): el miembro manda lo que le piden y el
-- comité puede mandar un formato, una guía o el detalle de un rechazo.
--
-- Se copia tal cual el patrón que ya resolvió lo mismo en `appeals` el 15-ago:
-- una columna `documents jsonb` con [{path, name, type}] y un bucket privado.

alter table pet_messages
  add column if not exists documents jsonb not null default '[]'::jsonb;

alter table reimbursement_messages
  add column if not exists documents jsonb not null default '[]'::jsonb;

comment on column pet_messages.documents is
  'Adjuntos del mensaje: [{path, name, type}] dentro del bucket conversacion-documentos';

comment on column reimbursement_messages.documents is
  'Adjuntos del mensaje: [{path, name, type}] dentro del bucket conversacion-documentos';

-- Bucket propio y PRIVADO, como `appeal-documents`. No se reusan los buckets
-- existentes: `reimbursement-invoices` son facturas y `appeal-documents` son
-- pruebas de una segunda revisión. Mezclarlos vuelve imposible responder
-- después "qué mandó esta persona, cuándo y para qué".
insert into storage.buckets (id, name, public)
values ('conversacion-documentos', 'conversacion-documentos', false)
on conflict (id) do nothing;

-- Cada quien escribe dentro de la carpeta con su propio id, y el comité lee
-- todo. Ojo: quien PINTA el hilo firma las rutas con el service role (ver
-- `src/lib/documentos-conversacion.ts`), y por eso el miembro sí alcanza a ver
-- lo que subió el comité aunque viva en la carpeta del admin. Estas políticas
-- gobiernan la subida directa desde el navegador, no el pintado.
drop policy if exists "conversacion docs upload" on storage.objects;
create policy "conversacion docs upload" on storage.objects
  for insert
  with check (
    bucket_id = 'conversacion-documentos'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "conversacion docs read" on storage.objects;
create policy "conversacion docs read" on storage.objects
  for select
  using (
    bucket_id = 'conversacion-documentos'
    and ((auth.uid())::text = (storage.foldername(name))[1] or public.is_admin())
  );

-- Agrega columnas: sin esto PostgREST sigue con el esquema viejo y las
-- consultas que piden `documents` fallan con 400, que en pantalla se lee como
-- "no hay datos" y no como error.
notify pgrst, 'reload schema';
