import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actorDeEquipo,
  adjuntosParaGuardar,
  apagaIA,
  contenidoDeMensaje,
  esAnuncio,
  esReferralMasReciente,
  fuenteDeReferral,
  selloDeReferral,
  esEstadoVigente,
  estadoPlantilla,
  externalUserIdFlowly,
  filaDeSalienteExterno,
  fuenteDeAnuncio,
  identidadDeContacto,
  leerConversacion,
  leerDatosMensaje,
  leerEvento,
  mapearReferral,
  origenDeSaliente,
  reflejoDeConversacion,
  tieneTextoLegible,
} from '../../src/lib/channels/flowly/mapeo.ts';

// Payloads con la forma documentada en PLATFORM-INTEGRATION.md §11.3.

const mensaje = (extra = {}) => ({
  id: '2bd2898a-2151-4004-bfb1-4d337c84d62e',
  direction: 'in',
  type: 'text',
  body: '¿Cuánto cuesta la membresía?',
  status: null,
  created_at: '2026-10-06T21:49:10.988+00:00',
  error: null,
  sent_by: null,
  actor: null,
  attachment: null,
  attachments: [],
  ...extra,
});

const recibido = (msg, extra = {}) => ({
  id: '5b1d77e7-696c-4ab6-b583-f50e2b78d530',
  event: 'message.received',
  created_at: '2026-10-06T21:59:27.951125+00:00',
  data: {
    channel: 'whatsapp',
    conversation_id: '88db861b-f9f6-46be-91d1-f30e8a3c1813',
    connection_id: '6bdfeb16-73e7-43ed-961c-71e937a6b695',
    message: msg,
    ...extra,
  },
});

test('lee el sobre del evento y rechaza lo que no lo es', () => {
  const e = leerEvento(recibido(mensaje()));
  assert.equal(e.id, '5b1d77e7-696c-4ab6-b583-f50e2b78d530');
  assert.equal(e.event, 'message.received');
  assert.equal(leerEvento(null), null);
  assert.equal(leerEvento({ event: 'x' }), null);
  assert.equal(leerEvento('texto'), null);
});

test('mensaje de texto entrante: canal, ids y contenido tal cual', () => {
  const d = leerDatosMensaje(leerEvento(recibido(mensaje())).data);
  assert.equal(d.channel, 'whatsapp');
  assert.equal(d.conversation_id, '88db861b-f9f6-46be-91d1-f30e8a3c1813');
  assert.equal(d.message.direction, 'in');
  assert.equal(contenidoDeMensaje(d.message), '¿Cuánto cuesta la membresía?');
  assert.equal(tieneTextoLegible(d.message), true);
  assert.equal(d.message.referral, null);
});

test('canal desconocido o mensaje sin id = no se procesa', () => {
  assert.equal(leerDatosMensaje({ channel: 'telegram', conversation_id: 'x', message: mensaje() }), null);
  assert.equal(leerDatosMensaje({ channel: 'whatsapp', conversation_id: 'x', message: { direction: 'in' } }), null);
});

test('archivos: etiqueta legible, pie si lo trae, y sin url guardada', () => {
  const pdf = {
    id: '3cf7e088',
    kind: 'document',
    mime_type: 'application/pdf',
    filename: 'OC-1043.pdf',
    size: 183422,
    caption: 'Adjunto la orden',
    status: 'ready',
    failure: null,
    url: 'https://x.supabase.co/firmada?token=abc',
    url_expires_at: '2026-10-15T00:56:34.031Z',
  };
  const doc = leerDatosMensaje({
    channel: 'whatsapp',
    conversation_id: 'c1',
    message: mensaje({ type: 'document', body: 'Adjunto la orden', attachment: pdf, attachments: [pdf] }),
  }).message;
  assert.equal(contenidoDeMensaje(doc), '[Documento: OC-1043.pdf] Adjunto la orden');
  const guardados = adjuntosParaGuardar(doc);
  assert.equal(guardados.length, 1);
  assert.equal(guardados[0].flowly_attachment_id, '3cf7e088');
  assert.equal('url' in guardados[0], false, 'la url dura una hora: nunca se guarda');

  const audio = leerDatosMensaje({
    channel: 'whatsapp',
    conversation_id: 'c1',
    message: mensaje({
      type: 'audio',
      body: null,
      attachment: { id: 'a1', kind: 'audio', status: 'pending', url: null },
      attachments: [],
    }),
  }).message;
  assert.equal(contenidoDeMensaje(audio), '[Nota de voz]');
  assert.equal(tieneTextoLegible(audio), false);

  // Messenger/Instagram llaman "file" a un documento.
  const archivo = leerDatosMensaje({
    channel: 'facebook',
    conversation_id: 'c2',
    message: mensaje({ type: 'file', body: null, attachment: null, attachments: [] }),
  }).message;
  assert.equal(contenidoDeMensaje(archivo), '[Documento]');

  const plantilla = leerDatosMensaje({
    channel: 'whatsapp',
    conversation_id: 'c3',
    message: mensaje({ direction: 'out', type: 'template', body: 'recordatorio_cita', sent_by: 'system', actor: 'pa-sistema', status: 'sent' }),
  }).message;
  assert.equal(contenidoDeMensaje(plantilla), '[plantilla recordatorio_cita]');
});

test('eco de coexistencia: alguien contestó desde la app del teléfono', () => {
  const eco = leerDatosMensaje({
    channel: 'whatsapp',
    conversation_id: 'c1',
    message: mensaje({
      id: 'eco-1',
      direction: 'out',
      body: 'Hola, soy Lucero, te llamo en 5 min',
      status: 'sent',
      sent_by: 'human',
      actor: 'native_app',
    }),
  }).message;
  assert.equal(origenDeSaliente(eco), 'telefono');
  assert.equal(apagaIA(eco), true, 'una persona escribiendo apaga la IA, como en Flowly (§6.3)');
  const fila = filaDeSalienteExterno(eco);
  assert.equal(fila.direction, 'out');
  assert.equal(fila.sender, 'admin');
  assert.equal(fila.external_actor, 'native_app');
  assert.equal(fila.flowly_message_id, 'eco-1');
  assert.equal(fila.delivery_status, 'sent');
  assert.equal(fila.send_error, null);
});

test('salientes: propio, operador, automático de Flowly y fallido', () => {
  const base = { direction: 'out', status: 'sent' };
  assert.equal(origenDeSaliente(mensaje({ ...base, sent_by: 'agent', actor: 'pa-agente-ventas' })), 'propio');
  assert.equal(origenDeSaliente(mensaje({ ...base, sent_by: 'human', actor: actorDeEquipo('u-1') })), 'propio');
  assert.equal(origenDeSaliente(mensaje({ ...base, sent_by: 'human', actor: 'operator' })), 'operador');
  const auto = mensaje({ ...base, sent_by: null, actor: null });
  assert.equal(origenDeSaliente(auto), 'flowly');
  assert.equal(apagaIA(auto), false, 'un mensaje automático no es una persona');
  assert.equal(apagaIA(mensaje({ ...base, sent_by: 'agent', actor: 'pa-agente-ventas' })), false);

  const fallido = filaDeSalienteExterno(
    mensaje({ ...base, status: 'failed', sent_by: 'human', actor: 'operator', error: 'Meta no pudo entregar el mensaje.' }),
  );
  assert.equal(fallido.send_error, 'Meta no pudo entregar el mensaje.');
  assert.equal(fallido.sent_at, null);
});

test('actor del equipo: prefijo propio, nunca un actor reservado, máximo 200', () => {
  const a = actorDeEquipo('9b0c'.repeat(80));
  assert.ok(a.startsWith('pa-'));
  assert.ok(a.length <= 200);
  assert.notEqual(actorDeEquipo('x').toLowerCase(), 'operator');
});

// Referral real de Flowly (§4.5, rama feat/ctwa-referral, f4cf547).
const referralWa = {
  channel: 'whatsapp',
  received_at: '2026-10-19T15:00:00.000Z',
  message_id: '55555555-5555-4555-8555-555555555555',
  source_type: 'ad',
  meta_source: 'ad',
  source_id: '120214011111111111',
  ad_id: '120214011111111111',
  source_url: 'https://fb.me/3cr4Wqqkv',
  headline: 'Consulta gratis',
  body: 'Agenda hoy y recibe un 10% de descuento',
  media_type: 'image',
  image_url: 'https://scontent.xx.fbcdn.net/v/t45.1600-4/abc.jpg?oh=1',
  video_url: null,
  thumbnail_url: null,
  ctwa_clid: 'ARAkLkA8rmlFeiCktEJQ',
  welcome_message: null,
  ref: null,
  referral_type: null,
  post_id: null,
  product_id: null,
};

const referralMessenger = {
  channel: 'facebook',
  received_at: '2026-10-19T15:00:00.000Z',
  message_id: null,
  source_type: 'ad',
  meta_source: 'ADS',
  source_id: '6045246247433',
  ad_id: '6045246247433',
  source_url: null,
  headline: 'Consulta gratis',
  body: null,
  media_type: null,
  image_url: 'https://scontent.xx.fbcdn.net/photo.jpg',
  video_url: null,
  thumbnail_url: null,
  ctwa_clid: null,
  welcome_message: null,
  ref: 'promo-octubre',
  referral_type: 'OPEN_THREAD',
  post_id: '1000_2000',
  product_id: null,
};

test('referral en message.referral (clic a WhatsApp): se guarda con la forma del contrato', () => {
  const evento = recibido(
    mensaje({ id: '55555555-5555-4555-8555-555555555555', body: 'Hola, vi su anuncio', referral: referralWa }),
  );
  const d = leerDatosMensaje(leerEvento(evento).data);
  assert.deepEqual(d.message.referral, referralWa);
  assert.equal(esAnuncio(d.message.referral), true);
  assert.equal(fuenteDeReferral('whatsapp', d.message.referral), 'whatsapp_ad');
  assert.equal(selloDeReferral(d.message.referral), 'Llegó por anuncio · Consulta gratis');
});

test('referral: solo en entrantes; llaves desconocidas fuera, lo que no es texto queda null', () => {
  const saliente = leerDatosMensaje({
    channel: 'whatsapp',
    conversation_id: 'c1',
    message: mensaje({ direction: 'out', status: 'sent', referral: referralWa }),
  });
  assert.equal(saliente.message.referral, null);
  const r = mapearReferral({ ...referralWa, campo_nuevo: 'x', headline: 42, body: { a: 1 }, channel: 'telegram' });
  assert.equal('campo_nuevo' in r, false);
  assert.equal(r.headline, '42');
  assert.equal(r.body, null);
  assert.equal(r.channel, null);
  // Sin referral: null (se decide por referral !== null, nunca por llaves).
  assert.equal(leerDatosMensaje(leerEvento(recibido(mensaje())).data).message.referral, null);
  assert.equal(mapearReferral(null), null);
  assert.equal(mapearReferral([]), null);
  assert.equal(mapearReferral({}).source_type, 'unknown');
});

test('first_referral / last_referral en el objeto conversación (Messenger antes de escribir)', () => {
  const c = leerConversacion({
    id: 'c-msgr',
    channel: 'facebook',
    contact: { name: null, handle: null },
    connection_id: 'cx',
    agent_enabled: true,
    first_referral: referralMessenger,
    last_referral: referralMessenger,
  });
  assert.deepEqual(c.first_referral, referralMessenger);
  assert.equal(c.first_referral.message_id, null);
  assert.equal(c.last_referral.ref, 'promo-octubre');
  assert.equal(fuenteDeReferral('facebook', c.first_referral), 'messenger_ad');
  const sin = leerConversacion({ id: 'c2', channel: 'whatsapp', contact: {}, connection_id: 'cx', first_referral: null });
  assert.equal(sin.first_referral, null);
  assert.equal(sin.last_referral, null);
});

test('last_referral solo avanza: uno viejo o reenviado no lo regresa', () => {
  const viejo = { ...referralWa, received_at: '2026-10-01T00:00:00Z' };
  const nuevo = { ...referralWa, received_at: '2026-10-19T15:00:00Z', headline: 'Otro anuncio' };
  assert.equal(esReferralMasReciente(null, viejo), true);
  assert.equal(esReferralMasReciente(viejo, nuevo), true);
  assert.equal(esReferralMasReciente(nuevo, viejo), false);
  assert.equal(esReferralMasReciente(nuevo, nuevo), false, 'el mismo reenviado no cuenta como nuevo');
  assert.equal(esReferralMasReciente(nuevo, null), false);
  assert.equal(esReferralMasReciente(nuevo, { ...nuevo, received_at: null }), false);
});

test('publicación o enlace m.me: se atribuye, pero la fuente sigue siendo el canal', () => {
  const enlace = { ...referralMessenger, source_type: 'link', ad_id: null, source_id: null, headline: null };
  assert.equal(esAnuncio(enlace), false);
  assert.equal(fuenteDeReferral('facebook', enlace), 'facebook');
  assert.equal(selloDeReferral(enlace), 'Llegó por un enlace');
  const post = { ...enlace, source_type: 'post', headline: 'Nuestra guía' };
  assert.equal(selloDeReferral(post), 'Llegó por una publicación · Nuestra guía');
  assert.equal(selloDeReferral(null), null);
  assert.equal(selloDeReferral({ ...referralWa, headline: null }), 'Llegó por anuncio');
});

test('fuente del contacto cuando llegó por anuncio', () => {
  assert.equal(fuenteDeAnuncio('whatsapp'), 'whatsapp_ad');
  assert.equal(fuenteDeAnuncio('instagram'), 'instagram_ad');
  assert.equal(fuenteDeAnuncio('facebook'), 'messenger_ad');
});

test('identidades: WhatsApp por número (empata con el camino directo), Messenger por id de Flowly', () => {
  assert.equal(externalUserIdFlowly('whatsapp', 'c1', '5215512345678'), '5215512345678');
  assert.equal(externalUserIdFlowly('whatsapp', 'c1', null), 'flowly:c1');
  assert.equal(externalUserIdFlowly('facebook', 'c2', null), 'flowly:c2');
  assert.equal(externalUserIdFlowly('instagram', 'c3', '@pata.fan'), 'ig:pata.fan');
  assert.deepEqual(identidadDeContacto('whatsapp', 'c1', '+52 1 55 1234 5678'), { kind: 'whatsapp', value: '5215512345678' });
  assert.deepEqual(identidadDeContacto('facebook', 'c2', null), { kind: 'messenger', value: 'flowly:c2' });
  assert.deepEqual(identidadDeContacto('instagram', 'c3', 'pata.fan'), { kind: 'instagram', value: 'pata.fan' });
});

const conv = (extra = {}) =>
  leerConversacion({
    id: '88db861b',
    channel: 'whatsapp',
    contact: { name: 'Ana López', handle: '5215500000001' },
    connection_id: 'cx',
    unread: true,
    last_message_at: null,
    last_activity_at: '2026-10-06T21:49:10.966+00:00',
    agent_enabled: true,
    agent_enabled_override: null,
    taken_over_by: null,
    taken_over_at: null,
    ...extra,
  });

test('interruptor: una toma NUEVA en Flowly (teléfono) apaga la IA local', () => {
  const r = reflejoDeConversacion(conv({ agent_enabled: false, agent_enabled_override: false, taken_over_by: 'native_app' }), null);
  assert.equal(r.human_takeover, true);
  assert.equal(r.flowly_taken_over_by, 'native_app');
});

test('interruptor: devolverla al agente en Flowly la vuelve a encender aquí', () => {
  const r = reflejoDeConversacion(conv(), 'operator');
  assert.equal(r.human_takeover, false);
});

test('interruptor: un evento cualquiera NO deshace una toma local que Flowly nunca supo', () => {
  const r = reflejoDeConversacion(conv(), null);
  assert.equal(r.human_takeover, undefined);
  // y repetir la misma toma no vuelve a "tomarla"
  const igual = reflejoDeConversacion(conv({ agent_enabled: false, agent_enabled_override: false, taken_over_by: 'pa-equipo:u1' }), 'pa-equipo:u1');
  assert.equal(igual.human_takeover, undefined);
});

test('interruptor: la cuenta apagada no es una toma humana', () => {
  const r = reflejoDeConversacion(conv({ agent_enabled: false, agent_enabled_override: null }), null);
  assert.equal(r.flowly_agent_enabled, false);
  assert.equal(r.human_takeover, undefined);
});

test('eventos desordenados: un estado viejo no pisa uno nuevo', () => {
  assert.equal(esEstadoVigente('2026-10-06T22:00:00Z', '2026-10-06T21:59:00Z'), false);
  assert.equal(esEstadoVigente('2026-10-06T22:00:00Z', '2026-10-06T22:00:00Z'), true);
  assert.equal(esEstadoVigente(null, '2026-10-06T21:59:00Z'), true);
});

test('estados de plantilla de Meta → los de la tabla', () => {
  assert.equal(estadoPlantilla('APPROVED'), 'aprobada');
  assert.equal(estadoPlantilla('approved'), 'aprobada');
  assert.equal(estadoPlantilla('PENDING'), 'pendiente');
  assert.equal(estadoPlantilla('REJECTED'), 'rechazada');
  assert.equal(estadoPlantilla('PAUSED'), 'pausada');
  assert.equal(estadoPlantilla('DISABLED'), 'pausada');
  assert.equal(estadoPlantilla('IN_APPEAL'), 'pendiente');
});

import { decisionEntregaRepetida, MAX_INTENTOS } from '../../src/lib/channels/flowly/mapeo.ts';

test('dedupe de entregas: una procesada nunca se repite (ni el LLM)', () => {
  const ahora = Date.parse('2026-10-19T12:00:00Z');
  assert.equal(decisionEntregaRepetida({ processed_at: '2026-10-19T11:00:00Z', received_at: '2026-10-19T11:00:00Z', attempts: 1 }, ahora), 'duplicado');
  // otra copia llegó hace segundos y se está atendiendo
  assert.equal(decisionEntregaRepetida({ processed_at: null, received_at: '2026-10-19T11:59:30Z', attempts: 0 }, ahora), 'duplicado');
  // quedó a medias hace 5 minutos: se reprocesa
  assert.equal(decisionEntregaRepetida({ processed_at: null, received_at: '2026-10-19T11:55:00Z', attempts: 1 }, ahora), 'reprocesar');
  // ya se intentó demasiadas veces
  assert.equal(decisionEntregaRepetida({ processed_at: null, received_at: '2026-10-19T10:00:00Z', attempts: MAX_INTENTOS }, ahora), 'duplicado');
  assert.equal(decisionEntregaRepetida(null, ahora), 'duplicado');
});

import { ETIQUETA, etiquetaPorTipo } from '../../src/lib/channels/etiquetas.ts';
import { parseMetaWebhook } from '../../src/lib/channels/meta.ts';

test('etiquetas compartidas: Flowly y el webhook directo de Meta escriben lo mismo, sin emojis', () => {
  const porFlowly = (type, attachment, body = null) =>
    contenidoDeMensaje(
      leerDatosMensaje({
        channel: 'whatsapp',
        conversation_id: 'c',
        message: mensaje({ type, body, attachment, attachments: attachment ? [attachment] : [] }),
      }).message,
    );
  const porMeta = (m) =>
    parseMetaWebhook({
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: { contacts: [], messages: [{ from: '521', id: 'w1', ...m }] } }] }],
    })[0].text;

  assert.equal(porFlowly('image', { id: 'a', kind: 'image' }), porMeta({ type: 'image', image: { id: 'm' } }));
  assert.equal(porFlowly('audio', { id: 'a', kind: 'audio' }), porMeta({ type: 'audio', audio: { id: 'm', voice: true } }));
  assert.equal(porFlowly('video', { id: 'a', kind: 'video' }, 'mira'), porMeta({ type: 'video', video: { id: 'm', caption: 'mira' } }));
  assert.equal(porFlowly('sticker', { id: 'a', kind: 'sticker' }), porMeta({ type: 'sticker', sticker: { id: 'm' } }));
  assert.equal(
    porFlowly('document', { id: 'a', kind: 'document', filename: 'receta.pdf' }),
    porMeta({ type: 'document', document: { id: 'm', filename: 'receta.pdf' } }),
  );
  assert.equal(porFlowly('document', { id: 'a', kind: 'document', filename: 'receta.pdf' }), '[Documento: receta.pdf]');
  for (const e of Object.values(ETIQUETA)) assert.doesNotMatch(e, /\p{Extended_Pictographic}/u);
  assert.equal(etiquetaPorTipo('audio', { voz: false }), '[Audio]');
});
