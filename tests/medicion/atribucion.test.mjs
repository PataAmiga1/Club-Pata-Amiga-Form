// Atribución de pauta (utm/fbclid). Correr: node --test tests/medicion/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  combinarToques,
  describirToque,
  fbcDesdeFbclid,
  leerAtribucion,
  leerAtribucionGuardada,
  mismoToque,
  serializarAtribucion,
  toqueDesdeUrl,
} from '../../src/lib/atribucion.ts';

const AHORA = new Date('2026-10-28T18:00:00.000Z');

test('sin parámetros de campaña no hay toque (no pisa al anterior)', () => {
  assert.equal(toqueDesdeUrl('?foo=1&ref=algo', { ahora: AHORA }), null);
  assert.equal(toqueDesdeUrl('', { ahora: AHORA }), null);
});

test('lee utm_*, fbclid y gclid; guarda página y solo el dominio del referente', () => {
  const t = toqueDesdeUrl(
    '?utm_source=facebook&utm_medium=paid_social&utm_campaign=regalo&utm_content=gata-video&fbclid=AbC123&otra=x',
    { ahora: AHORA, pagina: '/landings/regalo', referente: 'https://l.instagram.com/?u=secreto' },
  );
  assert.deepEqual(t, {
    ts: '2026-10-28T18:00:00.000Z',
    utm_source: 'facebook',
    utm_medium: 'paid_social',
    utm_campaign: 'regalo',
    utm_content: 'gata-video',
    fbclid: 'AbC123',
    pagina: '/landings/regalo',
    referente: 'l.instagram.com',
  });
});

test('valores recortados a 200 y sin caracteres de control', () => {
  const t = toqueDesdeUrl(`?utm_campaign=${'x'.repeat(500)}&utm_source=a%0Ab`, { ahora: AHORA });
  assert.equal(t.utm_campaign.length, 200);
  assert.equal(t.utm_source, 'ab');
});

test('primer toque nunca se reemplaza; último siempre', () => {
  const t1 = toqueDesdeUrl('?utm_source=google&gclid=g1', { ahora: AHORA });
  const t2 = toqueDesdeUrl('?utm_source=facebook&fbclid=f1', { ahora: new Date('2026-11-02T10:00:00Z') });
  const a1 = combinarToques(null, t1);
  assert.equal(a1.primero, t1);
  assert.equal(a1.ultimo, t1);
  const a2 = combinarToques(a1, t2);
  assert.equal(a2.primero.gclid, 'g1');
  assert.equal(a2.ultimo.fbclid, 'f1');
});

test('cookie: ida y vuelta, y basura = null', () => {
  const t = toqueDesdeUrl('?utm_source=facebook&utm_campaign=regalo', { ahora: AHORA });
  const a = combinarToques(null, t);
  assert.deepEqual(leerAtribucion(serializarAtribucion(a)), a);
  assert.equal(leerAtribucion('no-es-json'), null);
  assert.equal(leerAtribucion(encodeURIComponent(JSON.stringify({ ultimo: { ts: 'x' } }))), null);
  assert.equal(leerAtribucion(undefined), null);
});

test('cookie editada a mano: solo pasan llaves conocidas', () => {
  const crudo = {
    primero: { ts: AHORA.toISOString(), utm_source: 'fb', role: 'admin', __proto__x: 1 },
    ultimo: { ts: AHORA.toISOString(), utm_campaign: 'c', inyectado: '<script>' },
  };
  const a = leerAtribucion(encodeURIComponent(JSON.stringify(crudo)));
  assert.deepEqual(Object.keys(a.primero).sort(), ['ts', 'utm_source']);
  assert.deepEqual(Object.keys(a.ultimo).sort(), ['ts', 'utm_campaign']);
});

test('sin primero válido, el último hace de primero', () => {
  const a = leerAtribucion(
    encodeURIComponent(JSON.stringify({ ultimo: { ts: AHORA.toISOString(), fbclid: 'z' } })),
  );
  assert.equal(a.primero.fbclid, 'z');
});

test('describir: Meta, Google y otras fuentes', () => {
  assert.equal(
    describirToque({ ts: 'x', utm_source: 'facebook', utm_medium: 'paid_social', utm_campaign: 'regalo', utm_content: 'gata' }),
    'Anuncio de Meta · campaña regalo · anuncio gata',
  );
  assert.equal(describirToque({ ts: 'x', fbclid: 'abc' }), 'Anuncio de Meta');
  assert.equal(describirToque({ ts: 'x', utm_source: 'instagram', utm_medium: 'bio' }), 'Meta (Facebook/Instagram)');
  assert.equal(describirToque({ ts: 'x', gclid: 'g' , utm_campaign: 'marca'}), 'Anuncio de Google · campaña marca');
  assert.equal(describirToque({ ts: 'x', utm_source: 'newsletter', utm_medium: 'email' }), 'newsletter (email)');
});

test('guardada en el perfil: se valida igual y conserva la fecha de guardado', () => {
  const t = toqueDesdeUrl('?utm_source=facebook', { ahora: AHORA });
  const g = leerAtribucionGuardada({ primero: t, ultimo: t, guardada: '2026-10-29T00:00:00.000Z' });
  assert.equal(g.guardada, '2026-10-29T00:00:00.000Z');
  assert.ok(mismoToque(g.primero, g.ultimo));
  assert.equal(leerAtribucionGuardada(null), null);
  assert.equal(leerAtribucionGuardada('texto'), null);
});

test('_fbc con el formato de Meta', () => {
  assert.equal(fbcDesdeFbclid('AbC', 1730138400123.7), 'fb.1.1730138400123.AbC');
});
