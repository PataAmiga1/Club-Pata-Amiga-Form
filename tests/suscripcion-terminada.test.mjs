import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  esErrorDeSuscripcionTerminada,
  suscripcionTerminada,
} from '../src/lib/plans/estado-stripe.ts';

// Error real de producción (Vercel, 4-nov-2026, /app/cuenta).
const errorDeProduccion = {
  type: 'StripeInvalidRequestError',
  code: 'invalid_canceled_subscription_fields',
  message: 'A canceled subscription can only update its cancellation_details and metadata.',
};

test('canceled e incomplete_expired ya no se pueden mover', () => {
  assert.equal(suscripcionTerminada('canceled'), true);
  assert.equal(suscripcionTerminada('incomplete_expired'), true);
});

test('los estados vivos sí se pueden mover', () => {
  for (const s of ['active', 'past_due', 'unpaid', 'trialing', 'incomplete', 'paused']) {
    assert.equal(suscripcionTerminada(s), false, s);
  }
  assert.equal(suscripcionTerminada(null), false);
  assert.equal(suscripcionTerminada(undefined), false);
});

test('reconoce el error de Stripe por su código', () => {
  assert.equal(esErrorDeSuscripcionTerminada(errorDeProduccion), true);
  assert.equal(esErrorDeSuscripcionTerminada({ raw: { code: 'invalid_canceled_subscription_fields' } }), true);
});

test('reconoce el error de Stripe por su mensaje si no trae código', () => {
  assert.equal(esErrorDeSuscripcionTerminada(new Error(errorDeProduccion.message)), true);
});

test('no confunde otros errores de Stripe', () => {
  assert.equal(esErrorDeSuscripcionTerminada({ code: 'resource_missing', message: 'No such subscription' }), false);
  assert.equal(esErrorDeSuscripcionTerminada(new Error('card_declined')), false);
  assert.equal(esErrorDeSuscripcionTerminada(null), false);
  assert.equal(esErrorDeSuscripcionTerminada('texto'), false);
});

// Contrato: ningún `subscriptions.update` de /app/cuenta ni de peludos-599 va
// directo a Stripe sin pasar por la revisión de «¿sigue viva?».
test('las acciones de Mi cuenta mueven Stripe solo por actualizarSiSigueViva', () => {
  const acciones = readFileSync(new URL('../src/app/app/cuenta/actions.ts', import.meta.url), 'utf8');
  assert.equal(/subscriptions\.update\(/.test(acciones), false);
});

test('cancelarAlCorte y reacomodarPrecioPrincipal revisan el estado en Stripe antes de moverla', () => {
  const src = readFileSync(new URL('../src/lib/plans/peludos-599.ts', import.meta.url), 'utf8');
  const cuerpo = (nombre) => {
    const i = src.indexOf(`export async function ${nombre}(`);
    assert.notEqual(i, -1, nombre);
    const j = src.indexOf('\nexport ', i + 1);
    return src.slice(i, j === -1 ? undefined : j);
  };
  for (const nombre of ['cancelarAlCorte', 'reacomodarPrecioPrincipal']) {
    const c = cuerpo(nombre);
    assert.equal(/subscriptions\.update\(/.test(c), false, `${nombre} llama update directo`);
    assert.match(c, /actualizarSiSigueViva\(/, nombre);
  }
  assert.match(cuerpo('cancelarAlCorte'), /suscripcionTerminada\(fila\.status\)/);
});
