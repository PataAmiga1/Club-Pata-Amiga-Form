// API de Conversiones de Meta: normalización, cifrado, cuerpo y candado de
// consentimiento. Correr: node --test tests/medicion/
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  cookieFbValida,
  cuerpoCapi,
  datosDeUsuario,
  ipDelCliente,
  metadataDeMedicion,
  normalizarCorreo,
  normalizarTelefono,
  sha256,
} from '../../src/lib/medicion/capi.ts';
import {
  idCompraCheckout,
  idCompraSuscripcion,
  idCuentaCreada,
  idRegistroPeludo,
} from '../../src/lib/medicion/eventos.ts';

const h = (s) => createHash('sha256').update(s).digest('hex');

test('correo: sin espacios y en minúsculas; sin @ no se manda', () => {
  assert.equal(normalizarCorreo('  Ana.Perez@Gmail.COM '), 'ana.perez@gmail.com');
  assert.equal(normalizarCorreo('sin-arroba'), null);
  assert.equal(normalizarCorreo(null), null);
});

test('teléfono: E.164 → dígitos; 10 dígitos viejos → lada 52', () => {
  assert.equal(normalizarTelefono('+52 55 1234 5678'), '525512345678');
  assert.equal(normalizarTelefono('5512345678'), '525512345678');
  assert.equal(normalizarTelefono('(55) 1234-5678'), '525512345678');
  assert.equal(normalizarTelefono('+1 415 555 0100'), '14155550100');
  assert.equal(normalizarTelefono('123'), null);
  assert.equal(normalizarTelefono(''), null);
});

test('user_data cifra correo, teléfono e id; IP/navegador/fbp/fbc van tal cual', () => {
  const u = datosDeUsuario({
    correo: 'ANA@x.mx',
    telefono: '5512345678',
    idExterno: 'u-1',
    ip: '1.2.3.4',
    agente: 'UA',
    fbp: 'fb.1.1.2',
    fbc: null,
  });
  assert.deepEqual(u, {
    em: [h('ana@x.mx')],
    ph: [h('525512345678')],
    external_id: [h('u-1')],
    client_ip_address: '1.2.3.4',
    client_user_agent: 'UA',
    fbp: 'fb.1.1.2',
  });
  assert.equal(sha256('a'), h('a'));
});

test('cuerpo: evento con event_id, website, valor en MXN y código de prueba', () => {
  const c = cuerpoCapi(
    {
      nombre: 'Purchase',
      eventoId: idCompraCheckout('cs_test_1'),
      instante: 1761674400.9,
      url: 'https://www.pataamiga.mx/registro/bienvenida',
      persona: { correo: 'a@b.mx' },
      datos: { valor: 599, moneda: 'mxn', contenidoIds: ['599'], tipoContenido: 'product' },
    },
    'TEST123',
  );
  assert.equal(c.test_event_code, 'TEST123');
  const [e] = c.data;
  assert.equal(e.event_name, 'Purchase');
  assert.equal(e.event_id, 'compra-cs_test_1');
  assert.equal(e.event_time, 1761674400);
  assert.equal(e.action_source, 'website');
  assert.deepEqual(e.custom_data, { value: 599, currency: 'MXN', content_ids: ['599'], content_type: 'product' });
});

test('cuerpo sin valor ni código de prueba: no inventa campos', () => {
  const c = cuerpoCapi({
    nombre: 'CompleteRegistration',
    eventoId: idRegistroPeludo('p1'),
    instante: 1,
    url: 'u',
    persona: {},
  });
  assert.equal('test_event_code' in c, false);
  assert.equal('custom_data' in c.data[0], false);
  assert.deepEqual(c.data[0].user_data, {});
});

test('ids compartidos navegador/servidor', () => {
  assert.equal(idRegistroPeludo('abc'), 'registro-peludo-abc');
  assert.equal(idCompraSuscripcion('sub_1'), 'compra-sub_1');
  assert.equal(idCuentaCreada('u'), 'cuenta-u');
});

test('IP: la primera de x-forwarded-for; si no, x-real-ip', () => {
  assert.equal(ipDelCliente('201.1.1.1, 10.0.0.1'), '201.1.1.1');
  assert.equal(ipDelCliente(null, '201.2.2.2'), '201.2.2.2');
  assert.equal(ipDelCliente('', ''), null);
});

test('_fbp/_fbc: solo con la forma de Meta', () => {
  assert.equal(cookieFbValida('fb.1.1730138400123.AbC-_1'), 'fb.1.1730138400123.AbC-_1');
  assert.equal(cookieFbValida('fb.1.x.y'), null);
  assert.equal(cookieFbValida('<script>'), null);
  assert.equal(cookieFbValida(undefined), null);
});

test('consentimiento: sin «sí» no viaja NADA a la metadata de Stripe', () => {
  const ctx = { consentido: false, fbp: 'fb.1.1.2', fbc: null, ip: '1.2.3.4', agente: 'UA' };
  assert.deepEqual(metadataDeMedicion(ctx), {});
  assert.deepEqual(metadataDeMedicion({ ...ctx, consentido: true }), {
    medicion: '1',
    fbp: 'fb.1.1.2',
    cliente_ip: '1.2.3.4',
    cliente_ua: 'UA',
  });
});
