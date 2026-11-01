// Aviso por correo de mensajes nuevos en WhatsApp, Messenger e Instagram
// (notify_channel_new_message). Correr: node --test tests/canales/
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  correoDeAviso,
  escaparHtml,
  motivoDeAviso,
} from '../../src/lib/channels/aviso-mensaje-reglas.ts';

const base = { direction: 'in', channel: 'whatsapp', createdAt: '2026-11-01T18:00:00Z' };

test('conversación nueva (sin mensaje entrante anterior): avisa', () => {
  assert.equal(motivoDeAviso({ ...base, entranteAnteriorAt: null }), 'nueva');
});

test('vuelve a escribir tras más de 6 horas: avisa', () => {
  assert.equal(motivoDeAviso({ ...base, entranteAnteriorAt: '2026-11-01T11:59:00Z' }), 'regreso');
});

test('chat activo (menos de 6 horas, o justo 6): no avisa', () => {
  assert.equal(motivoDeAviso({ ...base, entranteAnteriorAt: '2026-11-01T17:55:00Z' }), null);
  assert.equal(motivoDeAviso({ ...base, entranteAnteriorAt: '2026-11-01T12:00:00Z' }), null);
});

test('mensajes nuestros (salientes) nunca avisan', () => {
  assert.equal(motivoDeAviso({ ...base, direction: 'out', entranteAnteriorAt: null }), null);
});

test('solo canales de Meta: correo u otros no avisan; Messenger e Instagram sí', () => {
  assert.equal(motivoDeAviso({ ...base, channel: 'email', entranteAnteriorAt: null }), null);
  assert.equal(motivoDeAviso({ ...base, channel: 'messenger', entranteAnteriorAt: null }), 'nueva');
  assert.equal(motivoDeAviso({ ...base, channel: 'facebook', entranteAnteriorAt: null }), 'nueva');
  assert.equal(motivoDeAviso({ ...base, channel: 'instagram', entranteAnteriorAt: null }), 'nueva');
});

test('el texto del cliente se escapa y se recorta a 200 caracteres', () => {
  assert.equal(escaparHtml('<b>"hola" & \'adiós\'</b>'), '&lt;b&gt;&quot;hola&quot; &amp; &#39;adiós&#39;&lt;/b&gt;');
  const { asunto, html } = correoDeAviso({
    motivo: 'nueva',
    channel: 'whatsapp',
    displayName: '<script>Ana</script>',
    contacto: '+5215511112222',
    texto: `<img src=x onerror=alert(1)>${'a'.repeat(400)}`,
    anuncio: 'Llegó por anuncio · Cuida a tu peludo',
    url: 'https://www.pataamiga.mx/ventas/conversaciones?conv=abc',
  });
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img src=x'));
  assert.ok(html.includes('Llegó por anuncio · Cuida a tu peludo'));
  assert.ok(html.includes('+5215511112222'));
  assert.ok(html.includes('href="https://www.pataamiga.mx/ventas/conversaciones?conv=abc"'));
  const mensaje = html.match(/«(.*)»/)[1];
  assert.ok(mensaje.length < 260, 'recortado a ~200 caracteres (más el escapado)');
  assert.match(asunto, /^Nuevo mensaje por WhatsApp: /);
});

test('regreso sin nombre usa el teléfono; sin anuncio no hay renglón de origen', () => {
  const { asunto, html } = correoDeAviso({
    motivo: 'regreso',
    channel: 'instagram',
    displayName: null,
    contacto: '@ana.perruna',
    texto: 'Hola otra vez',
    anuncio: null,
    url: 'https://www.pataamiga.mx/ventas/conversaciones?conv=x',
  });
  assert.equal(asunto, '@ana.perruna volvió a escribir por Instagram');
  assert.ok(!html.includes('Origen'));
});
