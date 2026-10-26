// Firma del webhook de Meta: falla CERRADO sin META_APP_SECRET.
// Correr: node --test tests/canales/
import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

import {
  verifyMetaSignature,
  webhookSinFirmaPermitido,
  _reiniciarAvisoFirma,
} from '../../src/lib/channels/meta.ts';

const ORIGINAL = { ...process.env };
const BODY = JSON.stringify({ object: 'whatsapp_business_account', entry: [] });
const firmar = (secreto, cuerpo = BODY) =>
  'sha256=' + createHmac('sha256', secreto).update(cuerpo).digest('hex');

let errores;
let avisos;
const consola = { error: console.error, warn: console.warn };

beforeEach(() => {
  delete process.env.META_APP_SECRET;
  delete process.env.META_WEBHOOK_ALLOW_UNSIGNED;
  _reiniciarAvisoFirma();
  errores = [];
  avisos = [];
  console.error = (...a) => errores.push(a.join(' '));
  console.warn = (...a) => avisos.push(a.join(' '));
});

afterEach(() => {
  process.env = { ...ORIGINAL };
  console.error = consola.error;
  console.warn = consola.warn;
});

test('sin secreto en producción: rechaza aunque pidan aceptar sin firma', () => {
  process.env.NODE_ENV = 'production';
  process.env.META_WEBHOOK_ALLOW_UNSIGNED = '1';
  assert.equal(webhookSinFirmaPermitido(), false);
  assert.equal(verifyMetaSignature(BODY, null), false);
  assert.equal(verifyMetaSignature(BODY, 'sha256=abc'), false);
});

test('sin secreto en desarrollo SIN opt-in: rechaza', () => {
  process.env.NODE_ENV = 'development';
  assert.equal(verifyMetaSignature(BODY, null), false);
});

test('sin secreto en desarrollo con META_WEBHOOK_ALLOW_UNSIGNED=1: acepta', () => {
  process.env.NODE_ENV = 'development';
  process.env.META_WEBHOOK_ALLOW_UNSIGNED = '1';
  assert.equal(webhookSinFirmaPermitido(), true);
  assert.equal(verifyMetaSignature(BODY, null), true);
  assert.equal(avisos.length, 1);
});

test('el opt-in exige exactamente "1"', () => {
  process.env.NODE_ENV = 'development';
  process.env.META_WEBHOOK_ALLOW_UNSIGNED = 'true';
  assert.equal(verifyMetaSignature(BODY, null), false);
});

test('sin secreto: el aviso en logs sale UNA sola vez', () => {
  process.env.NODE_ENV = 'production';
  for (let i = 0; i < 5; i++) verifyMetaSignature(BODY, null);
  assert.equal(errores.length, 1);
  assert.match(errores[0], /META_APP_SECRET/);
});

test('con secreto: acepta la firma correcta', () => {
  process.env.NODE_ENV = 'production';
  process.env.META_APP_SECRET = 'secreto-de-prueba';
  assert.equal(verifyMetaSignature(BODY, firmar('secreto-de-prueba')), true);
});

test('con secreto: rechaza firma de otro secreto, otro cuerpo, sin prefijo o ausente', () => {
  process.env.NODE_ENV = 'production';
  process.env.META_APP_SECRET = 'secreto-de-prueba';
  assert.equal(verifyMetaSignature(BODY, firmar('otro')), false);
  assert.equal(verifyMetaSignature(BODY + ' ', firmar('secreto-de-prueba')), false);
  assert.equal(verifyMetaSignature(BODY, firmar('secreto-de-prueba').slice(7)), false);
  assert.equal(verifyMetaSignature(BODY, null), false);
  assert.equal(verifyMetaSignature(BODY, 'sha256=zz'), false);
  assert.equal(verifyMetaSignature(BODY, 'sha256='), false);
});

test('con secreto, el opt-in de desarrollo NO deja pasar firmas malas', () => {
  process.env.NODE_ENV = 'development';
  process.env.META_WEBHOOK_ALLOW_UNSIGNED = '1';
  process.env.META_APP_SECRET = 'secreto-de-prueba';
  assert.equal(verifyMetaSignature(BODY, null), false);
  assert.equal(verifyMetaSignature(BODY, firmar('otro')), false);
});
