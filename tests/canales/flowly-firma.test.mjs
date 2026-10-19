import test from 'node:test';
import assert from 'node:assert/strict';
import {
  decidirFirma,
  firmarComoFlowly,
  verificarFirmaFlowly,
} from '../../src/lib/channels/flowly/firma.ts';

// Firma de los webhooks de Flowly (contrato §11.2): HMAC-SHA256 de "<t>.<cuerpo crudo>".

const SECRETO = 'whsec_prueba_local';
const CUERPO = '{"id":"5b1d77e7","event":"message.received","data":{"channel":"whatsapp"}}';
const AHORA = 1791323968;

test('acepta una firma correcta sobre los bytes crudos', () => {
  const header = firmarComoFlowly(CUERPO, SECRETO, AHORA);
  assert.equal(verificarFirmaFlowly(CUERPO, header, SECRETO, 300, AHORA), true);
});

test('rechaza un cuerpo alterado (aunque sea un espacio) y un JSON re-serializado', () => {
  const header = firmarComoFlowly(CUERPO, SECRETO, AHORA);
  assert.equal(verificarFirmaFlowly(CUERPO + ' ', header, SECRETO, 300, AHORA), false);
  const reserializado = JSON.stringify(JSON.parse(CUERPO), null, 2);
  assert.equal(verificarFirmaFlowly(reserializado, header, SECRETO, 300, AHORA), false);
});

test('rechaza otro secreto, un encabezado vacío o mal formado', () => {
  const header = firmarComoFlowly(CUERPO, SECRETO, AHORA);
  assert.equal(verificarFirmaFlowly(CUERPO, header, 'otro', 300, AHORA), false);
  assert.equal(verificarFirmaFlowly(CUERPO, null, SECRETO, 300, AHORA), false);
  assert.equal(verificarFirmaFlowly(CUERPO, 'v1=abc', SECRETO, 300, AHORA), false);
  assert.equal(verificarFirmaFlowly(CUERPO, `t=${AHORA}`, SECRETO, 300, AHORA), false);
  assert.equal(verificarFirmaFlowly(CUERPO, header, '', 300, AHORA), false);
});

test('rechaza un timestamp a más de 5 minutos (en los dos sentidos)', () => {
  const vieja = firmarComoFlowly(CUERPO, SECRETO, AHORA - 301);
  const futura = firmarComoFlowly(CUERPO, SECRETO, AHORA + 301);
  const justo = firmarComoFlowly(CUERPO, SECRETO, AHORA - 300);
  assert.equal(verificarFirmaFlowly(CUERPO, vieja, SECRETO, 300, AHORA), false);
  assert.equal(verificarFirmaFlowly(CUERPO, futura, SECRETO, 300, AHORA), false);
  assert.equal(verificarFirmaFlowly(CUERPO, justo, SECRETO, 300, AHORA), true);
});

test('acepta varias v1 si una es buena (y hex en mayúsculas)', () => {
  const buena = firmarComoFlowly(CUERPO, SECRETO, AHORA).split('v1=')[1];
  const header = `t=${AHORA},v1=${'0'.repeat(64)},v1=${buena.toUpperCase()}`;
  assert.equal(verificarFirmaFlowly(CUERPO, header, SECRETO, 300, AHORA), true);
});

test('falla CERRADO sin secreto, salvo el permiso explícito de desarrollo fuera de producción', () => {
  const base = { rawBody: CUERPO, header: null, ahoraSeg: AHORA };
  assert.equal(decidirFirma({ ...base, secretos: [], permitirSinFirma: false, entorno: 'development' }), 'sin_secreto');
  assert.equal(decidirFirma({ ...base, secretos: [undefined, '  '], permitirSinFirma: false, entorno: 'development' }), 'sin_secreto');
  assert.equal(decidirFirma({ ...base, secretos: [], permitirSinFirma: true, entorno: 'production' }), 'sin_secreto');
  assert.equal(decidirFirma({ ...base, secretos: [], permitirSinFirma: true, entorno: 'development' }), 'ok_sin_verificar');
});

test('con secreto configurado, el permiso de desarrollo NO salta la verificación', () => {
  const r = decidirFirma({
    rawBody: CUERPO,
    header: 't=1,v1=' + '0'.repeat(64),
    secretos: [SECRETO],
    permitirSinFirma: true,
    entorno: 'development',
    ahoraSeg: AHORA,
  });
  assert.equal(r, 'invalida');
});

test('rotación: acepta el secreto nuevo o el anterior', () => {
  const conAnterior = firmarComoFlowly(CUERPO, 'whsec_viejo', AHORA);
  const r = decidirFirma({
    rawBody: CUERPO,
    header: conAnterior,
    secretos: ['whsec_nuevo', 'whsec_viejo'],
    permitirSinFirma: false,
    entorno: 'production',
    ahoraSeg: AHORA,
  });
  assert.equal(r, 'ok');
});
