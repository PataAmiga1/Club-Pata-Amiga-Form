-- Landings de encuesta (equipo, 24-sep-2026): la consulta a los embajadores
-- antes de publicar la escalera de niveles se hace en una página de Pata Amiga,
-- no en un formulario ajeno. Las respuestas caen aquí, junto al registro de la
-- persona, para poder ver quién contestó y quién no, y exportarlas del panel.
--
-- En jsonb y no en columnas: cada encuesta tiene sus propias preguntas y van a
-- cambiar. Las columnas fijas de `campaign_leads` (nombre, correo, teléfono)
-- siguen siendo las mismas de siempre.
alter table campaign_leads add column if not exists respuestas jsonb;

comment on column campaign_leads.respuestas is
  'Respuestas de una landing tipo encuesta: {id_de_pregunta: respuesta}. Las preguntas viven en src/lib/landings.ts.';

notify pgrst, 'reload schema';
