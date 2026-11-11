// API de Eventos de TikTok: validación de ids, cuerpo del POST y que NO viajen
// datos personales (coincidencia avanzada apagada). Correr: node --test tests/medicion/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  URL_EVENTOS_TIKTOK,
  aEventoTikTok,
  cookieTtpValida,
  cuerpoEventosTikTok,
  propiedadesTikTok,
  respuestaTikTokAceptada,
  ttclidValido,
} from '../../src/lib/medicion/tiktok.ts';
import { metadataDeMedicion } from '../../src/lib/medicion/capi.ts';
import { idCompraCheckout } from '../../src/lib/medicion/eventos.ts';

const PIXEL = 'PIXELDEPRUEBA123';

test('endpoint de Events API 2.0', () => {
  assert.equal(URL_EVENTOS_TIKTOK, 'https://business-api.tiktok.com/open_api/v1.3/event/track/');
});

test('_ttp y ttclid: se validan por forma', () => {
  assert.equal(cookieTtpValida('2Lr3abcDEF456ghiJKL789mno'), '2Lr3abcDEF456ghiJKL789mno');
  assert.equal(cookieTtpValida('01JABCDEF0123456789_.tt.1'), '01JABCDEF0123456789_.tt.1');
  assert.equal(cookieTtpValida('corto'), null);
  assert.equal(cookieTtpValida('<script>alert(1)</script>'), null);
  assert.equal(cookieTtpValida(undefined), null);
  assert.equal(ttclidValido('E.C.P.CjkAbc-123_x'), 'E.C.P.CjkAbc-123_x');
  assert.equal(ttclidValido('a b'), null);
  assert.equal(ttclidValido('x'.repeat(201)), null);
  assert.equal(ttclidValido(null), null);
});

test('Purchase: cuerpo completo con el mismo id que el navegador', () => {
  const cuerpo = cuerpoEventosTikTok(
    {
      nombre: 'Purchase',
      eventoId: idCompraCheckout('cs_test_1'),
      instante: 1762900000.9,
      url: 'https://www.pataamiga.mx/registro/bienvenida',
      persona: {
        ip: '1.2.3.4',
        agente: 'UA',
        ttp: '2Lr3abcDEF456ghiJKL789mno',
        ttclid: 'E.C.P.clic',
      },
      datos: { valor: 649, moneda: 'mxn', contenidoIds: ['plan-599'], tipoContenido: 'product' },
    },
    PIXEL,
  );
  assert.deepEqual(cuerpo, {
    event_source: 'web',
    event_source_id: PIXEL,
    data: [
      {
        event: 'Purchase',
        event_time: 1762900000,
        event_id: 'compra-cs_test_1',
        page: { url: 'https://www.pataamiga.mx/registro/bienvenida' },
        user: { ttclid: 'E.C.P.clic', ttp: '2Lr3abcDEF456ghiJKL789mno', ip: '1.2.3.4', user_agent: 'UA' },
        properties: {
          value: 649,
          currency: 'MXN',
          content_type: 'product',
          contents: [{ content_id: 'plan-599', content_type: 'product', quantity: 1 }],
        },
      },
    ],
  });
});

test('Purchase con cupón de 100% (BUEN FIN): valor 0, no se omite', () => {
  assert.deepEqual(propiedadesTikTok({ valor: 0, moneda: 'mxn' }), { value: 0, currency: 'MXN' });
});

test('código de prueba solo si existe; ids inválidos no viajan', () => {
  const base = {
    nombre: 'CompleteRegistration',
    eventoId: 'registro-peludo-1',
    instante: 1,
    url: 'https://x',
    persona: { ttp: 'mal formada!', ttclid: '' },
    datos: { nombreContenido: 'Peludo · alta' },
  };
  const sin = cuerpoEventosTikTok(base, PIXEL, null);
  assert.equal('test_event_code' in sin, false);
  assert.deepEqual(sin.data[0].user, {});
  assert.deepEqual(sin.data[0].properties, { description: 'Peludo · alta' });
  assert.equal(cuerpoEventosTikTok(base, PIXEL, 'TEST123').test_event_code, 'TEST123');
});

test('coincidencia avanzada APAGADA: correo, teléfono e id externo no llegan a TikTok', () => {
  const t = aEventoTikTok({
    nombre: 'Purchase',
    eventoId: 'compra-1',
    instante: 1,
    url: 'https://x',
    persona: {
      correo: 'ana@ejemplo.mx',
      telefono: '+525511112222',
      idExterno: 'user-1',
      fbp: 'fb.1.1.2',
      ip: '1.2.3.4',
      agente: 'UA',
      ttp: '2Lr3abcDEF456ghiJKL789mno',
      ttclid: 'E.C.P.clic',
    },
  });
  const json = JSON.stringify(cuerpoEventosTikTok(t, PIXEL));
  for (const prohibido of ['ana@ejemplo.mx', '5511112222', 'user-1', 'email', 'phone', 'external_id', 'fb.1'])
    assert.equal(json.includes(prohibido), false, prohibido);
  assert.ok(json.includes('"ip":"1.2.3.4"'));
});

test('respuesta: TikTok contesta 200 siempre; manda `code`', () => {
  assert.equal(respuestaTikTokAceptada({ code: 0, message: 'OK' }), true);
  assert.equal(respuestaTikTokAceptada({ code: 40001, message: 'Access token invalid' }), false);
  assert.equal(respuestaTikTokAceptada(null), false);
  assert.equal(respuestaTikTokAceptada('OK'), false);
});

test('metadata de Stripe: _ttp y ttclid viajan SOLO con consentimiento', () => {
  const ctx = { consentido: false, fbp: null, fbc: null, ip: '1.2.3.4', agente: 'UA', ttp: 'abcdefgh12', ttclid: 'E.C.P.x' };
  assert.deepEqual(metadataDeMedicion(ctx), {});
  assert.deepEqual(metadataDeMedicion({ ...ctx, consentido: true }), {
    medicion: '1',
    cliente_ip: '1.2.3.4',
    cliente_ua: 'UA',
    ttp: 'abcdefgh12',
    ttclid: 'E.C.P.x',
  });
});
