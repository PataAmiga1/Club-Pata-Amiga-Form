-- Tipos de documento que estrena la persona moral (equipo, 19-ago)
--
-- Va en su PROPIO archivo, separado del resto de la fase, porque
-- `alter type ... add value` no deja usar el valor nuevo dentro de la misma
-- transacción que lo agrega. Mismo criterio que `20260811000006_pasaporte`.
--
--  · rfc_constancia  — la constancia de situación fiscal de la persona moral.
--    Es lo que se pide en el alta EN LUGAR del acta constitutiva: ya prueba que
--    la entidad existe, está registrada ante el SAT, y trae razón social y
--    domicilio fiscal. El acta son treinta y tantas páginas que una clínica
--    chica rara vez tiene escaneadas, y pedirla en el alta mata la conversión
--    de justo el perfil que se quiere sumar. Si algo no cuadra, el comité la
--    pide después por la conversación.
--
--  · comprobante_domicilio — el domicilio fiscal cuando el comité lo pide.

alter type public.document_type add value if not exists 'rfc_constancia';
alter type public.document_type add value if not exists 'comprobante_domicilio';
