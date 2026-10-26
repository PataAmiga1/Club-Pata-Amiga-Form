// Mensajes entrantes que no son texto (fotos, notas de voz, botones…).
// Correr: node --test tests/canales/
import test from 'node:test';
import assert from 'node:assert/strict';

import { parseMetaWebhook } from '../../src/lib/channels/meta.ts';

const wa = (...messages) => ({
  object: 'whatsapp_business_account',
  entry: [
    {
      changes: [
        {
          field: 'messages',
          value: {
            contacts: [{ wa_id: '5215511112222', profile: { name: 'Ana López' } }],
            messages: messages.map((m, i) => ({ from: '5215511112222', id: `wamid.${i}`, ...m })),
          },
        },
      ],
    },
  ],
});

const fb = (object, ...events) => ({
  object,
  entry: [{ messaging: events.map((e) => ({ sender: { id: 'psid-1' }, ...e })) }],
});

test('WhatsApp: el texto sigue igual', () => {
  const [m] = parseMetaWebhook(wa({ type: 'text', text: { body: 'Hola, ¿cuánto cuesta?' } }));
  assert.equal(m.text, 'Hola, ¿cuánto cuesta?');
  assert.equal(m.kind, 'text');
  assert.deepEqual(m.adjuntos, []);
  assert.equal(m.displayName, 'Ana López');
  assert.equal(m.externalMessageId, 'wamid.0');
});

test('WhatsApp: imagen con pie de foto y media id', () => {
  const [m] = parseMetaWebhook(
    wa({ type: 'image', image: { id: 'MEDIA1', mime_type: 'image/jpeg', caption: 'mi perrita' } }),
  );
  assert.equal(m.text, '[Imagen] mi perrita');
  assert.equal(m.kind, 'image');
  assert.deepEqual(m.adjuntos, [
    { origen: 'meta', tipo: 'image', media_id: 'MEDIA1', mime_type: 'image/jpeg' },
  ]);
});

test('WhatsApp: nota de voz vs archivo de audio', () => {
  const [voz, audio] = parseMetaWebhook(
    wa(
      { type: 'audio', audio: { id: 'A1', mime_type: 'audio/ogg; codecs=opus', voice: true } },
      { type: 'audio', audio: { id: 'A2', mime_type: 'audio/mpeg', voice: false } },
    ),
  );
  assert.equal(voz.text, '[Nota de voz]');
  assert.equal(voz.adjuntos[0].media_id, 'A1');
  assert.equal(audio.text, '[Audio]');
});

test('WhatsApp: video, documento, sticker', () => {
  const [v, d, s] = parseMetaWebhook(
    wa(
      { type: 'video', video: { id: 'V1' } },
      { type: 'document', document: { id: 'D1', filename: 'factura.pdf', mime_type: 'application/pdf' } },
      { type: 'sticker', sticker: { id: 'S1', mime_type: 'image/webp' } },
    ),
  );
  assert.equal(v.text, '[Video]');
  assert.equal(d.text, '[Documento: factura.pdf]');
  assert.equal(d.adjuntos[0].filename, 'factura.pdf');
  assert.equal(s.text, '[Sticker]');
});

test('WhatsApp: ubicación con nombre y coordenadas', () => {
  const [m] = parseMetaWebhook(
    wa({
      type: 'location',
      location: { latitude: 19.43, longitude: -99.13, name: 'Vet Roma', address: 'Álvaro Obregón 10' },
    }),
  );
  assert.equal(m.text, '[Ubicación: Vet Roma Álvaro Obregón 10]');
  assert.equal(m.adjuntos[0].latitude, 19.43);
  assert.equal(m.adjuntos[0].longitude, -99.13);
  const [solo] = parseMetaWebhook(wa({ type: 'location', location: { latitude: 1, longitude: 2 } }));
  assert.equal(solo.text, '[Ubicación]');
});

test('WhatsApp: botones de plantilla e interactivos usan el título', () => {
  const [b, i, l] = parseMetaWebhook(
    wa(
      { type: 'button', button: { text: 'Quiero info', payload: 'INFO' } },
      { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id: 'si', title: 'Sí, me interesa' } } },
      { type: 'interactive', interactive: { type: 'list_reply', list_reply: { id: 'gato', title: 'Tengo un michi' } } },
    ),
  );
  assert.equal(b.text, 'Quiero info');
  assert.equal(b.adjuntos[0].payload, 'INFO');
  assert.equal(i.text, 'Sí, me interesa');
  assert.equal(l.text, 'Tengo un michi');
});

test('WhatsApp: contacto compartido y tipo desconocido no se pierden', () => {
  const [c, u] = parseMetaWebhook(
    wa(
      { type: 'contacts', contacts: [{ name: { formatted_name: 'Dr. Pérez' } }] },
      { type: 'unsupported', errors: [{ code: 131051 }] },
    ),
  );
  assert.equal(c.text, '[Contacto compartido: Dr. Pérez]');
  assert.equal(u.text, '[Mensaje que no se puede mostrar]');
});

test('WhatsApp: reacciones y avisos del sistema se ignoran', () => {
  const r = parseMetaWebhook(
    wa(
      { type: 'reaction', reaction: { emoji: '❤️', message_id: 'x' } },
      { type: 'system', system: { body: 'cambió de número' } },
    ),
  );
  assert.deepEqual(r, []);
});

test('WhatsApp: payload de estados (sin messages) no genera mensajes', () => {
  const body = {
    entry: [{ changes: [{ field: 'messages', value: { statuses: [{ status: 'read' }] } }] }],
  };
  assert.deepEqual(parseMetaWebhook(body), []);
});

test('Messenger: texto sigue igual y el eco de la página se ignora', () => {
  const r = parseMetaWebhook(
    fb('page', { message: { mid: 'm1', text: 'Hola' } }, { message: { mid: 'm2', text: 'eco', is_echo: true } }),
  );
  assert.equal(r.length, 1);
  assert.equal(r[0].text, 'Hola');
  assert.equal(r[0].channel, 'facebook');
  assert.equal(r[0].kind, 'text');
});

test('Messenger: foto, nota de voz, sticker y archivo', () => {
  const r = parseMetaWebhook(
    fb(
      'page',
      { message: { mid: 'm1', attachments: [{ type: 'image', payload: { url: 'https://cdn.fb/x.jpg' } }] } },
      { message: { mid: 'm2', attachments: [{ type: 'audio', payload: { url: 'https://cdn.fb/a.mp4' } }] } },
      { message: { mid: 'm3', attachments: [{ type: 'image', payload: { url: 'https://cdn.fb/s.png', sticker_id: 369239263222822 } }] } },
      { message: { mid: 'm4', attachments: [{ type: 'file', payload: { url: 'https://cdn.fb/f/receta%20vet.pdf?x=1' } }] } },
    ),
  );
  assert.deepEqual(r.map((m) => m.text), ['[Imagen]', '[Nota de voz]', '[Sticker]', '[Documento: receta vet.pdf]']);
  assert.equal(r[0].adjuntos[0].url, 'https://cdn.fb/x.jpg');
  assert.equal(r[0].kind, 'image');
});

test('Instagram: foto con texto, reel compartido y mención en historia', () => {
  const r = parseMetaWebhook(
    fb(
      'instagram',
      { message: { mid: 'i1', text: 'mira', attachments: [{ type: 'image', payload: { url: 'https://ig/x' } }] } },
      { message: { mid: 'i2', attachments: [{ type: 'ig_reel', payload: { url: 'https://ig/r' } }] } },
      { message: { mid: 'i3', attachments: [{ type: 'story_mention', payload: { url: 'https://ig/s' } }] } },
    ),
  );
  assert.equal(r[0].channel, 'instagram');
  assert.equal(r[0].text, '[Imagen] mira');
  assert.equal(r[1].text, '[Reel compartido]');
  assert.equal(r[2].text, '[Te mencionó en su historia]');
});

test('Messenger: postback de botón y quick reply', () => {
  const r = parseMetaWebhook(
    fb(
      'page',
      { postback: { mid: 'p1', title: 'Ver planes', payload: 'PLANES' } },
      { message: { mid: 'q1', text: 'Sí', quick_reply: { payload: 'SI' } } },
    ),
  );
  assert.equal(r[0].text, 'Ver planes');
  assert.equal(r[0].kind, 'postback');
  assert.equal(r[0].externalMessageId, 'p1');
  assert.equal(r[1].text, 'Sí');
  assert.deepEqual(r[1].adjuntos, [{ origen: 'meta', tipo: 'quick_reply', payload: 'SI' }]);
});

test('Messenger: lecturas, entregas, reacciones y mensajes vacíos se ignoran', () => {
  const r = parseMetaWebhook(
    fb(
      'page',
      { read: { watermark: 1 } },
      { delivery: { mids: ['x'] } },
      { reaction: { reaction: 'love', mid: 'x' } },
      { message: { mid: 'v1' } },
    ),
  );
  assert.deepEqual(r, []);
});

test('Instagram: mensaje no compatible queda con etiqueta', () => {
  const [m] = parseMetaWebhook(fb('instagram', { message: { mid: 'u1', is_unsupported: true } }));
  assert.equal(m.text, '[Mensaje que no se puede mostrar]');
});

test('payload basura no truena', () => {
  assert.deepEqual(parseMetaWebhook(null), []);
  assert.deepEqual(parseMetaWebhook({ entry: [{ messaging: [{}] }] }), []);
  assert.deepEqual(parseMetaWebhook({ entry: [{ changes: [{ field: 'messages', value: { messages: [{ type: 'image' }] } }] }] }), []);
});
