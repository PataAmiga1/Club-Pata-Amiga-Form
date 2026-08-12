-- Identificación de miembros (equipo, 11-ago):
--   · A los MIEMBROS ya no se les pide INE (los embajadores lo conservan).
--   · Los EXTRANJEROS suben PASAPORTE en lugar de CURP (no pueden tener CURP).
--
-- `documents.document_type` es un enum; sin este valor, subir el pasaporte
-- truena con "invalid input value for enum".

alter type public.document_type add value if not exists 'passport';

notify pgrst, 'reload schema';
