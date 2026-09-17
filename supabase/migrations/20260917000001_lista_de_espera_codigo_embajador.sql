-- Registro cerrado (17-sep-2026): quien llega por un link de embajador
-- (/registro?codigo=…) termina en la lista de espera. Se guarda el código para
-- darle su referido al embajador cuando abra la membresía nueva.
alter table campaign_leads add column if not exists ambassador_code text;

notify pgrst, 'reload schema';
