-- Bucket de los documentos de una solicitud (equipo, 19-ago)
--
-- Aquí va lo que estrena la persona moral: la constancia de situación fiscal y,
-- cuando el comité lo pida, el comprobante de domicilio.
--
-- LAS INE NO VIVEN AQUÍ. Siguen en `ine-documents`, que es el bucket de
-- identificaciones desde siempre — también las de un representante legal, que
-- al final es una INE como cualquier otra. Qué bucket le toca a cada documento
-- se deriva de su `document_type` en `src/lib/documentos-solicitud.ts`; por eso
-- no hace falta una columna que lo guarde.
--
-- Y no se reusa `ine-documents` para la constancia por la misma razón que
-- `appeal-documents` no reusó `reimbursement-invoices` (15-ago): mezclar cosas
-- distintas en un bucket vuelve imposible responder después "qué subió esta
-- persona y para qué".

insert into storage.buckets (id, name, public)
values ('documentos-solicitud', 'documentos-solicitud', false)
on conflict (id) do nothing;

-- Mismas reglas que el resto de buckets privados: cada quien escribe y lee
-- dentro de la carpeta con su propio id, y el comité lo ve todo. El pintado del
-- panel firma con el service role, como con la INE.
drop policy if exists "documentos solicitud upload" on storage.objects;
create policy "documentos solicitud upload" on storage.objects
  for insert
  with check (
    bucket_id = 'documentos-solicitud'
    and (auth.uid())::text = (storage.foldername(name))[1]
  );

drop policy if exists "documentos solicitud read" on storage.objects;
create policy "documentos solicitud read" on storage.objects
  for select
  using (
    bucket_id = 'documentos-solicitud'
    and ((auth.uid())::text = (storage.foldername(name))[1] or public.is_admin())
  );
