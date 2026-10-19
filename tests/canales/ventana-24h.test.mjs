// Ventana de 24 h de Meta: una sola regla para la bandeja y el servidor.
// Correr: node --test tests/canales/
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  canalConVentana,
  comprobarVentana,
  errorVentanaCerrada,
  ventanaAbierta,
  VENTANA_MS,
} from '../../src/lib/channels/ventana.ts';

const AHORA = Date.parse('2026-10-19T18:00:00Z');
const hace = (ms) => new Date(AHORA - ms).toISOString();
const HORA = 60 * 60 * 1000;

test('canales de Meta están sujetos a la ventana; correo y portal no', () => {
  for (const c of ['whatsapp', 'facebook', 'instagram']) assert.equal(canalConVentana(c), true);
  for (const c of ['email', 'portal', 'web']) assert.equal(canalConVentana(c), false);
});

test('dentro de 24 h: abierta', () => {
  assert.equal(ventanaAbierta('whatsapp', hace(1 * HORA), AHORA), true);
  assert.equal(ventanaAbierta('instagram', hace(23.9 * HORA), AHORA), true);
});

test('a las 24 h exactas o después: cerrada', () => {
  assert.equal(ventanaAbierta('whatsapp', hace(VENTANA_MS), AHORA), false);
  assert.equal(ventanaAbierta('facebook', hace(25 * HORA), AHORA), false);
});

test('sin mensaje entrante o fecha inválida: cerrada en Meta, abierta en correo', () => {
  assert.equal(ventanaAbierta('whatsapp', null, AHORA), false);
  assert.equal(ventanaAbierta('whatsapp', 'no-es-fecha', AHORA), false);
  assert.equal(ventanaAbierta('email', null, AHORA), true);
});

test('acepta Date además de ISO', () => {
  assert.equal(ventanaAbierta('whatsapp', new Date(AHORA - HORA), AHORA), true);
});

test('el error explica la salida: plantilla en WhatsApp, esperar en Messenger/IG', () => {
  assert.match(errorVentanaCerrada('whatsapp'), /plantilla aprobada/);
  assert.match(errorVentanaCerrada('facebook'), /Messenger/);
  assert.match(errorVentanaCerrada('instagram'), /Instagram/);
});

/** Cliente de Supabase falso: solo lo que usa ultimoEntranteDe. */
function clienteFalso(createdAt, registro = {}) {
  const q = {
    select: () => q,
    eq: (col, val) => {
      registro[col] = val;
      return q;
    },
    order: () => q,
    limit: () => q,
    maybeSingle: async () => ({ data: createdAt ? { created_at: createdAt } : null }),
  };
  return {
    from: (tabla) => {
      registro.tabla = tabla;
      return q;
    },
  };
}

test('comprobarVentana (servidor): busca el último ENTRANTE de ese hilo', async () => {
  const registro = {};
  const res = await comprobarVentana(clienteFalso(hace(HORA), registro), 'conv-1', 'whatsapp', AHORA);
  assert.equal(res, null);
  assert.equal(registro.tabla, 'channel_messages');
  assert.equal(registro.conversation_id, 'conv-1');
  assert.equal(registro.direction, 'in');
});

test('comprobarVentana: ventana vencida o sin entrantes devuelve el error', async () => {
  assert.equal(
    await comprobarVentana(clienteFalso(hace(30 * HORA)), 'c', 'whatsapp', AHORA),
    errorVentanaCerrada('whatsapp'),
  );
  assert.equal(
    await comprobarVentana(clienteFalso(null), 'c', 'instagram', AHORA),
    errorVentanaCerrada('instagram'),
  );
});

test('comprobarVentana: correo no consulta la base y siempre deja enviar', async () => {
  const cliente = { from: () => { throw new Error('no debía consultar'); } };
  assert.equal(await comprobarVentana(cliente, 'c', 'email', AHORA), null);
});
