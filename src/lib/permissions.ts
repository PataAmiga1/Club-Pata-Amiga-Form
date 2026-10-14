/**
 * Permisos del panel y del portal de ventas — FUENTE ÚNICA.
 *
 * Regla de la arquitectura (docs/portal-ventas/00-ARQUITECTURA-Y-ROADMAP.md):
 * los componentes NO conocen nombres de roles. Reciben capacidades como props
 * y preguntan `can(rol, capacidad)`. Agregar un permiso es una línea aquí.
 *
 * Ojo: esto decide qué se MUESTRA. La seguridad real son las server actions
 * (que vuelven a preguntar por el rol) y las políticas RLS de Supabase.
 * Ocultar un botón no es proteger un dato.
 *
 * Cada sección del plan agrega sus capacidades cuando se construye; aquí están
 * las de la Fase 0 más las transversales.
 */

export type Role =
  | "member"
  | "ventas"
  | "gerente_ventas"
  | "admin"
  | "super_admin";

/** Roles que trabajan en un panel (no son miembros del club). */
const STAFF: Role[] = ["ventas", "gerente_ventas", "admin", "super_admin"];

/**
 * Qué roles tienen cada capacidad. El orden de las llaves agrupa por área para
 * que se lea como la matriz del documento de arquitectura.
 */
const CAPABILITIES = {
  // --- Portales -----------------------------------------------------------
  "portal.admin": ["admin", "super_admin"],
  "portal.ventas": ["ventas", "gerente_ventas", "admin", "super_admin"],

  // --- Datos del miembro --------------------------------------------------
  /** Expediente esencial: nombre, contacto, membresía, mascotas. */
  "miembro.expediente": ["admin", "super_admin"],
  /** Identidad, bancarios y fiscales (INE, CURP, RFC, CLABE). NUNCA ventas. */
  "miembro.sensible": ["super_admin"],

  // --- CRM: contactos y pipelines (sección 1) -----------------------------
  "contactos.ver": ["ventas", "gerente_ventas", "admin", "super_admin"],
  "contactos.editar": ["ventas", "gerente_ventas", "admin", "super_admin"],
  /** Fusionar duplicados y borrar: pierde información, así que va al gerente. */
  "contactos.fusionar": ["gerente_ventas", "admin", "super_admin"],
  "contactos.borrar": ["gerente_ventas", "admin", "super_admin"],
  /** Definir campos personalizados afecta a todo el equipo. */
  "campos.administrar": ["gerente_ventas", "admin", "super_admin"],
  "oportunidades.editar": ["ventas", "gerente_ventas", "admin", "super_admin"],
  /** Crear/editar pipelines y etapas. */
  "pipelines.administrar": ["gerente_ventas", "admin", "super_admin"],

  // --- Membresías y cupones (sección 3) -----------------------------------
  /**
   * Crear versiones de plan, publicarlas en Stripe y administrar cupones.
   * Cambiar un beneficio VINCULANTE exige además ser super admin y pasar por
   * la compuerta legal — eso lo revisa la server action, no esta matriz.
   */
  "membresias.administrar": ["gerente_ventas", "admin", "super_admin"],

  // --- Aprobaciones (secciones 4 y 5) -------------------------------------
  "contenido.aprobar": ["gerente_ventas", "admin", "super_admin"],
  "boletin.aprobar": ["gerente_ventas", "admin", "super_admin"],

  // --- Boletín (sección 5) -------------------------------------------------
  /** Crear temas, escribir el brief, correr los agentes, editar bloques, probar. */
  "boletin.redactar": ["ventas", "gerente_ventas", "admin", "super_admin"],
  /** Programar el envío. Ventas redacta y prueba, pero no dispara. */
  "boletin.programar": ["gerente_ventas", "admin", "super_admin"],
  /**
   * Confirmar la revisión veterinaria de un tema de salud. Va a
   * administración, no a ventas: es el mismo criterio que rige al bot.
   */
  "boletin.revision_vet": ["admin", "super_admin"],
  /** Editar las plantillas de marca del boletín. */
  "boletin.plantillas": ["gerente_ventas", "super_admin"],
  /**
   * Cargar la audiencia del boletín (sitio anterior + landings + miembros
   * activos). Mete gente a una lista de envío masivo: solo administración.
   */
  "boletin.audiencia": ["admin", "super_admin"],

  // --- Bajas de correo («lista negra») -------------------------------------
  /** Ver quién pidió no recibir correos de mercadotecnia. */
  "bajas.ver": ["ventas", "gerente_ventas", "admin", "super_admin"],
  /**
   * Dar de baja a alguien a mano o deshacer una baja (cuando la persona lo
   * pide). Deshacer vuelve a escribirle a alguien que dijo que no: va al gerente.
   */
  "bajas.administrar": ["gerente_ventas", "admin", "super_admin"],

  // --- Calendario de contenido (sección 4) --------------------------------
  /** Redactar, editar borradores y enviar a revisión. */
  "contenido.redactar": ["ventas", "gerente_ventas", "admin", "super_admin"],
  /**
   * Conectar cuentas de redes. Va al gerente y al super admin (no a `admin`):
   * son tokens de las cuentas públicas de la marca.
   */
  "canales.administrar": ["gerente_ventas", "super_admin"],
  /**
   * Pasar por encima de las validaciones SALTABLES (límites del canal,
   * reclamos de salud, activos faltantes), dejando constancia.
   * La de terminología no está aquí porque no la salta nadie.
   */
  "contenido.saltar_validaciones": ["super_admin"],

  // --- Equipo y tableros (sección 7) --------------------------------------
  /** Ver los números de todo el equipo, no solo los propios. */
  "tablero.equipo": ["gerente_ventas", "admin", "super_admin"],

  // --- Configuración ------------------------------------------------------
  /** Interruptores de plataforma: agentes IA, agente demo, topes de gasto. */
  "ajustes.plataforma": ["super_admin"],
} as const satisfies Record<string, readonly Role[]>;

export type Capability = keyof typeof CAPABILITIES;

/** ¿Este rol tiene esta capacidad? */
export function can(role: Role | null | undefined, capability: Capability) {
  if (!role) return false;
  return (CAPABILITIES[capability] as readonly Role[]).includes(role);
}

/** Todas las capacidades de un rol — para pasarlas de una vez a un componente. */
export function capabilitiesOf(role: Role | null | undefined) {
  const result = {} as Record<Capability, boolean>;
  for (const key of Object.keys(CAPABILITIES) as Capability[]) {
    result[key] = can(role, key);
  }
  return result;
}

export type Capabilities = ReturnType<typeof capabilitiesOf>;

export function isStaff(role: Role | null | undefined): boolean {
  return !!role && STAFF.includes(role);
}

// --- Portales -------------------------------------------------------------

export type Portal = "admin" | "ventas";

export const PORTALS: Record<
  Portal,
  { href: string; name: string; label: string; icon: string }
> = {
  admin: {
    href: "/admin",
    name: "Administración",
    label: "PANEL DEL COMITÉ",
    icon: "🛡️",
  },
  ventas: {
    href: "/ventas",
    name: "Ventas",
    label: "PORTAL DE VENTAS",
    icon: "📈",
  },
};

/**
 * A qué portales puede entrar este rol. Si devuelve más de uno, el menú de
 * perfil muestra el conmutador "Cambiar de portal".
 */
export function portalsOf(role: Role | null | undefined): Portal[] {
  return (Object.keys(PORTALS) as Portal[]).filter((p) =>
    can(role, `portal.${p}` as Capability),
  );
}

/** Etiqueta legible del rol, para el pie de la barra lateral. */
export const ROLE_LABELS: Record<Role, string> = {
  member: "Miembro",
  ventas: "Ventas",
  gerente_ventas: "Gerente de ventas",
  admin: "Admin",
  super_admin: "Super admin",
};
