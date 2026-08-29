/**
 * Catálogo de lo que se puede exportar desde Finanzas (equipo, 26-ago).
 *
 * QUÉ PIDIERON: bajar en CSV el histórico de pagos, el padrón de usuarios,
 * cuántos entraron y cuántos se fueron por mes, por qué cancelaron, y una
 * columna de sexo — «que el documento pueda incluir las variables que el admin
 * elija al exportar».
 *
 * POR QUÉ SON TRES REPORTES Y NO UNO. Un CSV tiene UN significado por renglón.
 * «Un pago», «un miembro» y «un mes» son tres cosas distintas, y meterlas en el
 * mismo archivo obliga a dejar media tabla vacía en cada renglón — que es
 * exactamente lo que vuelve inútil una exportación. Así que la pantalla es una
 * sola y la elección es del admin: primero decide qué es un renglón, luego tica
 * las columnas que quiere. La combinación libre está DENTRO de cada grano, que
 * es donde de verdad sirve.
 *
 * Este archivo es solo el catálogo —sin dependencias, sin base de datos— para
 * que la pantalla y la ruta que arma el CSV lean exactamente la misma lista y
 * no se desincronicen.
 */

export type GranoDeReporte = "pagos" | "padron" | "mensual";

export type ColumnaExportable = {
  key: string;
  label: string;
  /** Para agrupar las casillas en la pantalla. */
  grupo: string;
  /** Marcada por omisión. */
  porOmision?: boolean;
};

export type ReporteExportable = {
  grano: GranoDeReporte;
  nombre: string;
  /** Qué es un renglón. Se muestra en la pantalla: es LA decisión del paso 1. */
  unRenglonEs: string;
  descripcion: string;
  /** Aviso que se pinta en rojo cuando aplica. */
  advertencia?: string;
  columnas: ColumnaExportable[];
};

const SEXO: ColumnaExportable[] = [
  { key: "sexo", label: "Sexo", grupo: "Persona", porOmision: true },
  {
    key: "sexo_origen",
    label: "Origen del sexo (capturado / CURP)",
    grupo: "Persona",
  },
];

export const REPORTES: ReporteExportable[] = [
  {
    grano: "pagos",
    nombre: "Pagos",
    unRenglonEs: "un cobro",
    descripcion:
      "El histórico de cobros de la pasarela, con los datos del miembro anexados. Un miembro aparece tantas veces como pagos tenga.",
    advertencia:
      "Los pagos salen EN VIVO de Stripe, no de nuestra base. En el ambiente de pruebas son cobros de prueba: para un archivo que sirva, bájalo desde producción.",
    columnas: [
      { key: "comprobante", label: "Comprobante", grupo: "Cobro", porOmision: true },
      { key: "fecha", label: "Fecha del cobro", grupo: "Cobro", porOmision: true },
      { key: "monto", label: "Monto", grupo: "Cobro", porOmision: true },
      { key: "moneda", label: "Moneda", grupo: "Cobro" },
      { key: "estado_cobro", label: "Estado del cobro", grupo: "Cobro", porOmision: true },
      { key: "correo", label: "Correo", grupo: "Persona", porOmision: true },
      { key: "nombre", label: "Nombre", grupo: "Persona", porOmision: true },
      { key: "apellidos", label: "Apellidos", grupo: "Persona", porOmision: true },
      ...SEXO,
      { key: "telefono", label: "Teléfono", grupo: "Persona" },
      { key: "curp", label: "CURP", grupo: "Persona" },
      { key: "plan", label: "Plan", grupo: "Membresía", porOmision: true },
      { key: "estatus_membresia", label: "Estatus de la membresía", grupo: "Membresía" },
      { key: "alta", label: "Fecha de alta", grupo: "Membresía" },
      { key: "baja", label: "Fecha de baja", grupo: "Membresía" },
      { key: "motivo_baja", label: "Motivo de la baja", grupo: "Membresía" },
      { key: "codigo_embajador", label: "Código de embajador usado", grupo: "Origen" },
      { key: "estado", label: "Estado", grupo: "Ubicación" },
      { key: "ciudad", label: "Ciudad", grupo: "Ubicación" },
      { key: "cp", label: "Código postal", grupo: "Ubicación" },
    ],
  },
  {
    grano: "padron",
    nombre: "Padrón de miembros",
    unRenglonEs: "un miembro",
    descripcion:
      "Todos los miembros, con su alta, su baja, el motivo y lo que llevan pagado. Es el archivo para contar personas.",
    columnas: [
      { key: "nombre", label: "Nombre", grupo: "Persona", porOmision: true },
      { key: "apellido_paterno", label: "Apellido paterno", grupo: "Persona", porOmision: true },
      { key: "apellido_materno", label: "Apellido materno", grupo: "Persona" },
      { key: "correo", label: "Correo", grupo: "Persona", porOmision: true },
      { key: "telefono", label: "Teléfono", grupo: "Persona", porOmision: true },
      ...SEXO,
      { key: "fecha_nacimiento", label: "Fecha de nacimiento", grupo: "Persona" },
      { key: "edad", label: "Edad", grupo: "Persona" },
      { key: "curp", label: "CURP", grupo: "Persona" },
      { key: "nacionalidad", label: "Nacionalidad", grupo: "Persona" },
      { key: "estatus_membresia", label: "Estatus de la membresía", grupo: "Membresía", porOmision: true },
      { key: "plan", label: "Plan", grupo: "Membresía", porOmision: true },
      { key: "monto_plan", label: "Monto del plan", grupo: "Membresía" },
      { key: "registro", label: "Fecha de registro", grupo: "Membresía" },
      { key: "alta", label: "Fecha de alta (miembro desde)", grupo: "Membresía", porOmision: true },
      { key: "baja", label: "Fecha de baja", grupo: "Membresía", porOmision: true },
      { key: "motivo_baja", label: "Motivo de la baja", grupo: "Membresía", porOmision: true },
      { key: "origen_baja", label: "Cómo se detectó la baja", grupo: "Membresía" },
      { key: "encuesta_baja", label: "Encuesta de la baja", grupo: "Membresía" },
      { key: "fin_cobertura", label: "Fin de la cobertura", grupo: "Membresía" },
      { key: "regreso", label: "Regresó el", grupo: "Membresía" },
      { key: "peludos", label: "Peludos registrados", grupo: "Membresía" },
      { key: "codigo_embajador", label: "Código de embajador usado", grupo: "Origen" },
      { key: "utm_source", label: "UTM source", grupo: "Origen" },
      { key: "utm_medium", label: "UTM medium", grupo: "Origen" },
      { key: "utm_campaign", label: "UTM campaign", grupo: "Origen" },
      { key: "estado", label: "Estado", grupo: "Ubicación", porOmision: true },
      { key: "ciudad", label: "Ciudad", grupo: "Ubicación" },
      { key: "colonia", label: "Colonia", grupo: "Ubicación" },
      { key: "cp", label: "Código postal", grupo: "Ubicación" },
      { key: "cfdi", label: "Pide factura", grupo: "Fiscal" },
      { key: "rfc", label: "RFC", grupo: "Fiscal" },
    ],
  },
  {
    grano: "mensual",
    nombre: "Resumen mensual",
    unRenglonEs: "un mes",
    descripcion:
      "Cuántos entraron y cuántos se fueron cada mes. Es el archivo para ver la tendencia, no para ver personas.",
    advertencia:
      "Las bajas juntan las tres señales que traen fecha: la cancelación hecha en la plataforma, la que detectó la pasarela y la suscripción cancelada. El MOTIVO solo existe para la primera — una tarjeta rechazada no da motivos —, y por eso «bajas sin motivo» casi siempre trae número.",
    columnas: [
      { key: "mes", label: "Mes", grupo: "Mes", porOmision: true },
      { key: "altas", label: "Altas", grupo: "Movimiento", porOmision: true },
      { key: "bajas", label: "Bajas", grupo: "Movimiento", porOmision: true },
      { key: "neto", label: "Neto (altas − bajas)", grupo: "Movimiento", porOmision: true },
      { key: "bajas_con_motivo", label: "Bajas con motivo", grupo: "Movimiento", porOmision: true },
      { key: "bajas_sin_motivo", label: "Bajas sin motivo", grupo: "Movimiento", porOmision: true },
      { key: "regresos", label: "Regresaron", grupo: "Movimiento" },
      { key: "motivos", label: "Motivos del mes (desglosados)", grupo: "Motivos", porOmision: true },
      { key: "altas_hombre", label: "Altas · hombres", grupo: "Sexo" },
      { key: "altas_mujer", label: "Altas · mujeres", grupo: "Sexo" },
      { key: "altas_sin_sexo", label: "Altas · sin dato de sexo", grupo: "Sexo" },
    ],
  },
];

export function reportePorGrano(grano: string): ReporteExportable | undefined {
  return REPORTES.find((r) => r.grano === grano);
}

/** Las columnas marcadas por omisión de un reporte. */
export function columnasPorOmision(r: ReporteExportable): string[] {
  return r.columnas.filter((c) => c.porOmision).map((c) => c.key);
}

/** Las columnas de un reporte agrupadas para pintar la pantalla. */
export function porGrupo(r: ReporteExportable): [string, ColumnaExportable[]][] {
  const mapa = new Map<string, ColumnaExportable[]>();
  for (const c of r.columnas) {
    if (!mapa.has(c.grupo)) mapa.set(c.grupo, []);
    mapa.get(c.grupo)!.push(c);
  }
  return [...mapa.entries()];
}
