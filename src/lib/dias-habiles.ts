/**
 * DÍAS HÁBILES EN MÉXICO — membresía $599, sección 3 (17-sep-2026).
 *
 * La promesa es «te depositamos en 5 días hábiles; si nos tardamos más, tu mes
 * es gratis». Hábil = lunes a viernes que no sea descanso obligatorio del
 * artículo 74 de la Ley Federal del Trabajo (decisión del equipo: los
 * festivos NO cuentan).
 *
 * Días como "yyyy-mm-dd", sin zona horaria: quien llama pasa el día mexicano
 * (src/lib/zona-horaria.ts). No incluye jornadas electorales (el mismo
 * artículo las cuenta, pero no tienen fecha fija): si coinciden con un
 * plazo, el equipo lo ajusta a mano.
 */

function fecha(dia: string): Date {
  const [a, m, d] = dia.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d, 12));
}

function texto(f: Date): string {
  return f.toISOString().slice(0, 10);
}

/** El n-ésimo lunes (1 = primero) de un mes. */
function enesimoLunes(anio: number, mes: number, n: number): string {
  const primero = new Date(Date.UTC(anio, mes - 1, 1, 12));
  const hastaLunes = (8 - primero.getUTCDay()) % 7;
  primero.setUTCDate(1 + hastaLunes + (n - 1) * 7);
  return texto(primero);
}

/** Descansos obligatorios de un año (LFT art. 74). */
export function festivosOficiales(anio: number): string[] {
  const dias = [
    `${anio}-01-01`, // Año Nuevo
    enesimoLunes(anio, 2, 1), // Constitución: primer lunes de febrero
    enesimoLunes(anio, 3, 3), // Natalicio de Benito Juárez: tercer lunes de marzo
    `${anio}-05-01`, // Día del Trabajo
    `${anio}-09-16`, // Independencia
    enesimoLunes(anio, 11, 3), // Revolución: tercer lunes de noviembre
    `${anio}-12-25`, // Navidad
  ];
  // Transmisión del Poder Ejecutivo Federal: 1 de octubre cada seis años (2024, 2030…)
  if ((anio - 2024) % 6 === 0) dias.push(`${anio}-10-01`);
  return dias;
}

export function esDiaHabil(dia: string): boolean {
  const f = fecha(dia);
  const semana = f.getUTCDay();
  if (semana === 0 || semana === 6) return false;
  return !festivosOficiales(f.getUTCFullYear()).includes(dia);
}

/**
 * El día hábil que queda `n` días hábiles después de `dia` (sin contar
 * `dia`). Solicitud un viernes + 5 → el viernes siguiente, si no hay festivos.
 */
export function sumarDiasHabiles(dia: string, n: number): string {
  const f = fecha(dia);
  let faltan = n;
  while (faltan > 0) {
    f.setUTCDate(f.getUTCDate() + 1);
    if (esDiaHabil(texto(f))) faltan--;
  }
  return texto(f);
}

/**
 * Días hábiles que faltan desde `hoy` hasta `vence` (0 si vence hoy, negativo
 * si ya pasó: -1 = venció ayer hábil).
 */
export function diasHabilesRestantes(hoy: string, vence: string): number {
  if (hoy === vence) return 0;
  const adelante = hoy < vence;
  let cuenta = 0;
  const f = fecha(hoy);
  const destino = vence;
  while (texto(f) !== destino) {
    f.setUTCDate(f.getUTCDate() + (adelante ? 1 : -1));
    if (esDiaHabil(texto(f))) cuenta++;
    if (Math.abs(cuenta) > 400) break;
  }
  return adelante ? cuenta : -cuenta;
}
