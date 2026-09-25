-- La encuesta de embajadores se manda por DM de Instagram (equipo, 25-sep-2026):
-- ahí la identidad de la persona es su @, no su correo. Muchos petinfluencers
-- contestan sin querer dar correo, y pedirlo cuesta respuestas.
--
-- Por eso el correo deja de ser obligatorio en `campaign_leads` y entra `handle`.
-- Ojo: el correo SIGUE siendo obligatorio en las landings que mandan algo
-- (regalo, guía) — eso se valida en el código de cada campaña, no aquí.
alter table campaign_leads add column if not exists handle text;
alter table campaign_leads alter column email drop not null;

comment on column campaign_leads.handle is
  'Arroba de redes (@usuario). En las landings de encuesta es la identidad principal, en lugar del correo.';

-- Contestar dos veces no duplica: la restriccion unica de (campaña, correo) ya
-- existía y aquí se agrega su gemela para el @. Parcial, porque la mayoría de
-- los registros no traen handle y varios NULL no deben chocar entre sí.
create unique index if not exists campaign_leads_handle_unico
  on campaign_leads (campaign, lower(handle))
  where handle is not null;

notify pgrst, 'reload schema';
