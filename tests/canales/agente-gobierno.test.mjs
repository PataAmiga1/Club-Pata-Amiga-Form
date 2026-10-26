import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  debeEscalarPorTexto,
  reglaCanal,
  reglaFlowly,
  reglaGasto,
  reglaPersona,
  reglaRitmo,
} from '../../src/lib/llm/gobierno-reglas.ts';
import { leerMapaProveedores, proveedorDe } from '../../src/lib/channels/proveedor.ts';

// Gobierno del agente de ventas: las mismas reglas para el camino directo y Flowly.

test('1. una persona tomó el hilo: la IA calla y no se avisa (no es un problema)', () => {
  assert.deepEqual(reglaPersona(true), {
    puede: false,
    motivo: 'Alguien del equipo tomó esta conversación',
    avisar: false,
  });
  assert.equal(reglaPersona(false).puede, true);
});

test('2. interruptor por canal: apagado = no responde y se avisa al equipo', () => {
  const r = reglaCanal('whatsapp', ' Instagram, WHATSAPP ');
  assert.equal(r.puede, false);
  assert.equal(r.avisar, true);
  assert.equal(reglaCanal('facebook', 'instagram,whatsapp').puede, true);
  assert.equal(reglaCanal('whatsapp', '').puede, true);
});

test('3. freno por hora: al llegar al máximo se detiene; 0 = sin límite', () => {
  assert.equal(reglaRitmo(12, 11).puede, true);
  const r = reglaRitmo(12, 12);
  assert.equal(r.puede, false);
  assert.equal(r.avisar, true);
  assert.equal(reglaRitmo(0, 999).puede, true);
});

test('4. tope diario en MXN: compara centavos contra pesos × 100; 0 = sin tope', () => {
  assert.equal(reglaGasto(150, 14_999).puede, true);
  const r = reglaGasto(150, 15_000);
  assert.equal(r.puede, false);
  assert.equal(r.avisar, true);
  assert.match(r.motivo, /\$150 MXN/);
  assert.equal(reglaGasto(0, 1e9).puede, true);
});

test('palabras de escalación: humano, queja, PROFECO…; no se repite si ya estaba marcada', () => {
  assert.equal(debeEscalarPorTexto('Quiero hablar con un humano', false), true);
  assert.equal(debeEscalarPorTexto('esto es un FRAUDE', false), true);
  assert.equal(debeEscalarPorTexto('voy a ir a la Profeco', false), true);
  assert.equal(debeEscalarPorTexto('quiero hablar con una persona real', false), true);
  assert.equal(debeEscalarPorTexto('¿cuánto cuesta para dos perritos?', false), false);
  assert.equal(debeEscalarPorTexto('Quiero hablar con un humano', true), false);
});

test('5. Flowly: agente apagado por una toma → no responde y hay que reflejar la toma', () => {
  const r = reglaFlowly({ agentEnabled: false, agentCanSend: false, takenOverBy: 'native_app', razon: 'open' });
  assert.equal(r.puede, false);
  assert.equal(r.avisar, false);
  assert.equal(r.reflejarToma, true);
});

test('5. Flowly: cuenta/cliente apagado no es una toma humana', () => {
  const r = reglaFlowly({ agentEnabled: false, agentCanSend: false, takenOverBy: null, razon: 'open' });
  assert.equal(r.puede, false);
  assert.equal(r.reflejarToma, false);
});

test('5. Flowly: ventana cerrada o solo-persona → la IA no gasta en el LLM', () => {
  assert.equal(
    reglaFlowly({ agentEnabled: true, agentCanSend: false, takenOverBy: null, razon: 'window_closed_template_required' }).puede,
    false,
  );
  const humano = reglaFlowly({ agentEnabled: true, agentCanSend: false, takenOverBy: null, razon: 'open' });
  assert.equal(humano.puede, false);
  assert.match(humano.motivo, /persona/);
  assert.equal(reglaFlowly({ agentEnabled: true, agentCanSend: true, takenOverBy: null, razon: 'open' }).puede, true);
});

test('el camino directo y Flowly usan el MISMO turno del agente (sin copias del gobierno)', () => {
  const meta = readFileSync('src/app/api/canales/meta/webhook/route.ts', 'utf8');
  const flowly = readFileSync('src/lib/channels/flowly/procesar.ts', 'utf8');
  const turno = readFileSync('src/lib/channels/agente-ventas.ts', 'utf8');
  for (const src of [meta, flowly]) assert.match(src, /responderComoAgenteVentas\(/);
  assert.doesNotMatch(meta, /puedeResponderIA|completeWithTools/);
  assert.match(turno, /puedeResponderIA\(/);
  assert.match(turno, /notify_channel_attention/);
  assert.match(turno, /escalarConversacion\(/);
  assert.match(turno, /registrarUso\(/);
  // La respuesta se guarda ANTES de enviarse (contrato §8.2).
  assert.ok(turno.indexOf('.insert(') < turno.indexOf('op.enviar('));
  // Antes del LLM, el chequeo fresco de Flowly.
  assert.ok(turno.indexOf('antesDeGenerar()') < turno.indexOf('completeWithTools('));
});

test('proveedor por canal: formato libre, "messenger" = facebook, vacío = directo', () => {
  const m = leerMapaProveedores('whatsapp=flowly, Messenger: flowly; instagram=direct_meta\nemail=flowly-x');
  assert.equal(proveedorDe(m, 'whatsapp'), 'flowly');
  assert.equal(proveedorDe(m, 'facebook'), 'flowly');
  assert.equal(proveedorDe(m, 'messenger'), 'flowly');
  assert.equal(proveedorDe(m, 'instagram'), 'direct_meta');
  assert.equal(proveedorDe(m, 'email'), 'direct_meta');
  assert.equal(proveedorDe(leerMapaProveedores(''), 'whatsapp'), 'direct_meta');
  assert.equal(proveedorDe(leerMapaProveedores(null), 'whatsapp'), 'direct_meta');
});
