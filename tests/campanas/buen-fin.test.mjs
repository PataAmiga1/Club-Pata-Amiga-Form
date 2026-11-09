// El Buen Fin 2026: ventana de fechas, cuentas y enlace al registro.
// Correr: node --test tests/campanas/   (pasa igual con TZ=UTC y TZ=America/Mexico_City)
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUEN_FIN,
  cuadraConLaPauta,
  cuentasBuenFin,
  enlaceDeRegistro,
  estadoDeLaCampana,
  leerPromoGuardada,
  promoDeLaUrl,
  vistaForzada,
} from '../../src/lib/campanas/buen-fin.ts';

test('estado por día de México, no por el reloj del proceso', () => {
  // 12-nov 23:59 en México = 13-nov 05:59 UTC: todavía es «antes».
  assert.equal(estadoDeLaCampana(new Date('2026-11-13T05:59:00Z')), 'antes');
  // 13-nov 00:00 en México = 06:00 UTC: arranca.
  assert.equal(estadoDeLaCampana(new Date('2026-11-13T06:00:00Z')), 'activa');
  assert.equal(estadoDeLaCampana(new Date('2026-11-15T18:00:00Z')), 'activa');
  // 17-nov 23:59 en México = 18-nov 05:59 UTC: sigue activa (en UTC ya sería 18).
  assert.equal(estadoDeLaCampana(new Date('2026-11-18T05:59:00Z')), 'activa');
  assert.equal(estadoDeLaCampana(new Date('2026-11-18T06:00:00Z')), 'terminada');
  assert.equal(estadoDeLaCampana(new Date('2026-11-09T12:00:00Z')), 'antes');
});

test('vista forzada solo acepta los tres estados', () => {
  assert.equal(vistaForzada('activa'), 'activa');
  assert.equal(vistaForzada(['terminada']), 'terminada');
  assert.equal(vistaForzada('cualquiera'), null);
  assert.equal(vistaForzada(undefined), null);
});

test('las cuentas con $599 y $7,188 dan lo que dice la pauta', () => {
  const c = cuentasBuenFin({ mensualPesos: 599, anualPesos: 7188 });
  assert.deepEqual(c, {
    mensual: 599,
    primerMes: 0,
    anualRegular: 7188,
    anualBuenFin: 6589,
    ahorroAnual: 599,
    primerAnioMensual: 6589,
  });
  assert.equal(cuadraConLaPauta(c), true);
  // Comparación honesta: el primer año cuesta lo mismo en las dos modalidades.
  assert.equal(c.primerAnioMensual, c.anualBuenFin);
});

test('si el precio real cambia, la página lo sabe', () => {
  const c = cuentasBuenFin({ mensualPesos: 649, anualPesos: 7188 });
  assert.equal(c.primerMes, 50);
  assert.equal(cuadraConLaPauta(c), false);
});

test('el enlace lleva modalidad, promo y SOLO la pauta; nunca `codigo`', () => {
  const url = enlaceDeRegistro('anual', {
    utm_source: 'instagram',
    utm_campaign: 'buenfin2026',
    fbclid: 'AbC',
    codigo: 'PATAMIGA-X',
    vista: 'activa',
    otra: ['a', 'b'],
  });
  const [ruta, busqueda] = url.split('?');
  assert.equal(ruta, '/registro');
  const q = new URLSearchParams(busqueda);
  assert.equal(q.get('modalidad'), 'anual');
  assert.equal(q.get('promo'), BUEN_FIN.codigo);
  assert.equal(q.get('utm_source'), 'instagram');
  assert.equal(q.get('utm_campaign'), 'buenfin2026');
  assert.equal(q.get('fbclid'), 'AbC');
  assert.equal(q.has('codigo'), false);
  assert.equal(q.has('vista'), false);
  assert.equal(q.has('otra'), false);
});

test('la URL del registro se guarda limpia y caduca', () => {
  const ahora = Date.parse('2026-11-14T18:00:00Z');
  const g = promoDeLaUrl('?modalidad=MENSUAL&promo=buenfin&utm_source=ig', ahora);
  assert.deepEqual(g, { promo: 'BUENFIN', modalidad: 'mensual', ts: ahora });
  assert.equal(promoDeLaUrl('?utm_source=ig', ahora), null);
  assert.equal(promoDeLaUrl('?promo=<script>&modalidad=trimestral', ahora), null);

  const crudo = JSON.stringify(g);
  assert.deepEqual(leerPromoGuardada(crudo, ahora + 1000), g);
  assert.equal(leerPromoGuardada(crudo, ahora + 31 * 86_400_000), null);
  assert.equal(leerPromoGuardada('no-es-json', ahora), null);
  assert.equal(leerPromoGuardada(null, ahora), null);
});
