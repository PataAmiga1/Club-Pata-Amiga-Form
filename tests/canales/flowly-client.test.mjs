import test from 'node:test';
import assert from 'node:assert/strict';
import {
  configFlowlyDesdeEntorno,
  crearClienteFlowly,
  decisionEnvioAgente,
  errorDeRespuesta,
} from '../../src/lib/channels/flowly/client.ts';

// Cliente de la API de Flowly contra un fetch falso: nunca toca la red.

const config = { base: 'https://flowly.test/api/v1', key: 'flw_live_PRUEBA' };

function respuesta(status, cuerpo, headers = {}) {
  return new Response(cuerpo === undefined ? null : JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function fetchFalso(respuestas) {
  const llamadas = [];
  const cola = [...respuestas];
  const f = async (url, init) => {
    llamadas.push({ url, init, body: init?.body ? JSON.parse(init.body) : undefined });
    const r = cola.shift();
    if (r instanceof Error) throw r;
    return typeof r === 'function' ? r() : r;
  };
  return { f, llamadas };
}

const cliente = (respuestas) => {
  const { f, llamadas } = fetchFalso(respuestas);
  const c = crearClienteFlowly({ config, fetch: f, esperar: async () => {}, pausas: [1, 1] });
  return { c, llamadas };
};

const envio = {
  conversationId: '88db861b',
  body: 'Hola, con gusto te ayudo',
  sentBy: 'agent',
  actor: 'pa-agente-ventas',
  idempotencyKey: 'agent:2bd2898a',
};

const mensajeOk = {
  id: 'm-1', direction: 'out', type: 'text', body: envio.body, status: 'sent',
  created_at: '2026-10-06T21:59:27Z', error: null, sent_by: 'agent', actor: 'pa-agente-ventas',
  attachment: null, attachments: [],
};

test('configuración: sin llave no hay cliente; base por omisión y sin diagonal final', () => {
  assert.equal(configFlowlyDesdeEntorno({}), null);
  assert.deepEqual(configFlowlyDesdeEntorno({ FLOWLY_API_KEY: 'k' }), {
    base: 'https://app.flowlysync.com/api/v1',
    key: 'k',
  });
  assert.equal(configFlowlyDesdeEntorno({ FLOWLY_API_KEY: 'k', FLOWLY_API_BASE: 'https://x/api/v1/' }).base, 'https://x/api/v1');
});

test('envío de texto: Bearer, Idempotency-Key, sent_by y actor siempre presentes', async () => {
  const { c, llamadas } = cliente([respuesta(201, mensajeOk)]);
  const r = await c.enviarTexto(envio);
  assert.equal(r.ok, true);
  assert.equal(r.replay, false);
  assert.equal(r.data.id, 'm-1');
  const [{ url, init, body }] = llamadas;
  assert.equal(url, 'https://flowly.test/api/v1/conversations/88db861b/messages');
  assert.equal(init.method, 'POST');
  assert.equal(init.headers.Authorization, 'Bearer flw_live_PRUEBA');
  assert.equal(init.headers['Idempotency-Key'], 'agent:2bd2898a');
  assert.equal(init.redirect, 'manual');
  assert.deepEqual(body, { body: envio.body, sent_by: 'agent', actor: 'pa-agente-ventas' });
});

test('idempotencia: un replay (200 + Idempotent-Replayed) cuenta como hecho', async () => {
  const { c } = cliente([respuesta(200, mensajeOk, { 'Idempotent-Replayed': 'true' })]);
  const r = await c.enviarTexto(envio);
  assert.equal(r.ok, true);
  assert.equal(r.replay, true);
  assert.equal(decisionEnvioAgente(r), 'hecho');
});

test('idempotencia: 503 se reintenta con la MISMA llave y el MISMO cuerpo', async () => {
  const { c, llamadas } = cliente([
    respuesta(503, { code: 'unavailable', message: 'x' }),
    respuesta(409, { code: 'idempotency_in_progress', message: 'y' }),
    respuesta(201, mensajeOk),
  ]);
  const r = await c.enviarTexto(envio);
  assert.equal(r.ok, true);
  assert.equal(llamadas.length, 3);
  for (const l of llamadas) {
    assert.equal(l.init.headers['Idempotency-Key'], 'agent:2bd2898a');
    assert.deepEqual(l.body, llamadas[0].body);
  }
});

test('idempotencia: falla de red se reintenta; si persiste, error "network" reintentable', async () => {
  const { c, llamadas } = cliente([new TypeError('fetch failed'), new TypeError('x'), new TypeError('y')]);
  const r = await c.enviarTexto(envio);
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 'network');
  assert.equal(r.reintentable, true);
  assert.equal(llamadas.length, 3);
  assert.equal(decisionEnvioAgente(r), 'reintentar');
});

test('llave reutilizada con otro texto (otra corrida del agente) = ya contestado', async () => {
  const { c, llamadas } = cliente([
    respuesta(400, {
      code: 'invalid_request',
      reused_key: true,
      message: 'Esa Idempotency-Key ya se usó con otra petición. Usa una clave nueva para un envío nuevo.',
    }),
  ]);
  const r = await c.enviarTexto(envio);
  assert.equal(llamadas.length, 1, 'un 400 nunca se reintenta');
  assert.equal(r.reusedKey, true);
  assert.equal(decisionEnvioAgente(r), 'hecho');
});

test('elegibilidad: ventana cerrada en WhatsApp → frase clara de "solo con plantilla", sin reintento', async () => {
  const { c, llamadas } = cliente([
    respuesta(409, {
      code: 'window_closed',
      message: 'La ventana de 24 horas se cerró. Solo se puede volver a escribir con una plantilla aprobada.',
    }),
  ]);
  const r = await c.enviarTexto({ ...envio, sentBy: 'human', actor: 'pa-equipo:u1', idempotencyKey: 'pa-msg:1' });
  assert.equal(llamadas.length, 1);
  assert.equal(r.ok, false);
  assert.equal(r.codigo, 'window_closed');
  assert.match(r.paraEquipo, /24 horas/);
  assert.match(r.paraEquipo, /plantilla aprobada/);
  assert.equal(decisionEnvioAgente(r), 'descartar');
});

test('elegibilidad: Messenger/Instagram fuera de ventana y sin mensaje previo', () => {
  const h = errorDeRespuesta(409, { code: 'human_agent_unavailable', message: 'La ventana de 24 horas se cerró…' });
  assert.match(h.paraEquipo, /vuelva a escribir/);
  assert.equal(decisionEnvioAgente(h), 'descartar');
  const n = errorDeRespuesta(409, { code: 'no_inbound', message: 'Esta persona todavía no ha escrito…' });
  assert.match(n.paraEquipo, /todavía no ha escrito/);
  assert.equal(decisionEnvioAgente(n), 'descartar');
  assert.equal(decisionEnvioAgente(errorDeRespuesta(409, { code: 'human_agent_only' })), 'descartar');
});

test('agente apagado mientras el LLM pensaba: se descarta en silencio', () => {
  const r = errorDeRespuesta(409, { code: 'agent_disabled', message: 'El agente está desactivado…' });
  assert.equal(decisionEnvioAgente(r), 'descartar');
  assert.equal(r.reintentable, false);
});

test('Meta lo rechazó: send_failed con message_id, frase de Flowly y sin repetir', () => {
  const r = errorDeRespuesta(502, {
    message_id: '4477125f',
    retryable: true,
    code: 'send_failed',
    message: 'Meta no respondió. El mensaje no salió; puedes reintentar en un momento.',
  });
  assert.equal(r.messageId, '4477125f');
  assert.equal(r.metaReintentable, true);
  assert.equal(r.reintentable, false, 'la llave ya se gastó en esta falla');
  assert.equal(r.paraEquipo, 'Meta no respondió. El mensaje no salió; puedes reintentar en un momento.');
  assert.equal(decisionEnvioAgente(r), 'fallo');
});

test('429 del borde (sin JSON) es reintentable; 401 no', async () => {
  const { c } = cliente([new Response('Too Many Requests', { status: 429 }), respuesta(201, mensajeOk)]);
  const r = await c.enviarTexto(envio);
  assert.equal(r.ok, true);
  const no = errorDeRespuesta(401, { code: 'unauthorized', message: 'La clave no es válida o fue revocada.' });
  assert.equal(no.reintentable, false);
  assert.equal(decisionEnvioAgente(no), 'fallo');
});

test('plantilla: a una conversación, con variables, sent_by y llave', async () => {
  const { c, llamadas } = cliente([
    respuesta(201, { message: { ...mensajeOk, type: 'template', body: 'seguimiento' }, conversation_id: '88db861b', contact_created: false }),
  ]);
  const r = await c.enviarPlantilla({
    template: 'seguimiento',
    language: 'es_MX',
    variables: ['Ana'],
    conversationId: '88db861b',
    sentBy: 'human',
    actor: 'pa-equipo:u1',
    idempotencyKey: 'pa-plantilla:1',
  });
  assert.equal(r.ok, true);
  assert.equal(llamadas[0].url, 'https://flowly.test/api/v1/messages/template');
  assert.deepEqual(llamadas[0].body, {
    template: 'seguimiento',
    language: 'es_MX',
    variables: ['Ana'],
    conversation_id: '88db861b',
    sent_by: 'human',
    actor: 'pa-equipo:u1',
  });
  assert.equal(llamadas[0].init.headers['Idempotency-Key'], 'pa-plantilla:1');
});

test('plantilla no aprobada: usa la frase de Flowly según su estado', () => {
  const r = errorDeRespuesta(409, {
    template_status: 'PENDING',
    code: 'template_not_approved',
    message: 'La plantilla todavía está en revisión en Meta; se podrá enviar cuando la aprueben.',
  });
  assert.match(r.paraEquipo, /revisión/);
});

test('interruptor: PATCH sin Idempotency-Key, con agent_enabled y actor', async () => {
  const { c, llamadas } = cliente([respuesta(200, { id: '88db861b' })]);
  await c.cambiarAgente('88db861b', false, 'pa-equipo:u1');
  assert.equal(llamadas[0].init.method, 'PATCH');
  assert.equal(llamadas[0].init.headers['Idempotency-Key'], undefined);
  assert.deepEqual(llamadas[0].body, { agent_enabled: false, actor: 'pa-equipo:u1' });
});

test('plantillas: recorre todas las páginas por cursor', async () => {
  const p = (id) => ({ id, name: id, language: 'es_MX', category: 'UTILITY', status: 'APPROVED', connection_id: 'c', variables: 1, supported: true, preview: 'Hola {{1}}' });
  const { c, llamadas } = cliente([
    respuesta(200, { data: [p('a'), p('b')], next_cursor: 'CUR' }),
    respuesta(200, { data: [p('c')], next_cursor: null }),
  ]);
  const r = await c.listarPlantillas();
  assert.equal(r.ok, true);
  assert.deepEqual(r.data.map((x) => x.id), ['a', 'b', 'c']);
  assert.match(llamadas[1].url, /cursor=CUR/);
});
