/**
 * Medición: Google Analytics 4, el píxel de Meta, el píxel de TikTok y
 * Microsoft Clarity.
 *
 * CONECTAR: las cuatro llaves son variables de entorno públicas y el equipo las
 * pone cuando tenga las cuentas. **Sin ellas no se carga NADA** — ni scripts,
 * ni cookies de terceros, ni peticiones a Google, Meta, TikTok o Microsoft. Así el
 * sitio no arrastra rastreadores mientras no exista la decisión de usarlos:
 *
 *   NEXT_PUBLIC_GA4_ID         G-XXXXXXXXXX   (Google Analytics 4)
 *   NEXT_PUBLIC_META_PIXEL_ID  1234567890     (píxel de Meta)
 *   NEXT_PUBLIC_TIKTOK_PIXEL_ID  C0ABC...      (píxel de TikTok)
 *   NEXT_PUBLIC_CLARITY_ID     abcdefghij     (Microsoft Clarity)
 *
 * Se leen con `process.env.NEXT_PUBLIC_*` escrito completo a propósito: Next
 * sustituye estas expresiones en tiempo de compilación y un acceso dinámico
 * (`process.env[nombre]`) llegaría vacío al navegador.
 */
import { leerConsentimiento } from "@/lib/consentimiento";

export const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID ?? "";
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";
export const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_ID ?? "";
export const TIKTOK_PIXEL_ID = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID ?? "";

export function medicionActiva(): boolean {
  return Boolean(GA4_ID || META_PIXEL_ID || TIKTOK_PIXEL_ID || CLARITY_ID);
}

/**
 * Rutas donde Clarity NO se carga.
 *
 * Clarity no cuenta visitas: GRABA LA SESIÓN — movimientos, clics, scroll y el
 * contenido de la pantalla. Dentro de la sesión del socio se ven CURP, INE,
 * cuentas bancarias, facturas y datos del peludo. Grabar eso sería recolectar
 * datos personales sensibles en un tercero sin que nadie lo haya decidido.
 *
 * Del lado público —donde vive el embudo que sí queremos entender— no hay nada
 * de eso, y ahí es justamente donde sirve el mapa de calor.
 *
 * Si algún día hace falta grabar dentro de la sesión, primero va la decisión
 * legal (aviso de privacidad + política de cookies) y el enmascarado estricto,
 * no al revés.
 */
export const CLARITY_RUTAS_EXCLUIDAS = [
  "/app",
  "/admin",
  "/ventas",
  "/embajador",
  "/centro",
] as const;

export function clarityPermitidoEn(ruta: string): boolean {
  return !CLARITY_RUTAS_EXCLUIDAS.some(
    (prefijo) => ruta === prefijo || ruta.startsWith(`${prefijo}/`),
  );
}

type Gtag = (...args: unknown[]) => void;
type Fbq = (...args: unknown[]) => void;
/** Lo que se usa de `ttq` (el snippet de TikTok crea más métodos). */
type Ttq = {
  page: () => void;
  track: (evento: string, parametros?: Record<string, unknown>, opciones?: { event_id: string }) => void;
  grantConsent?: () => void;
  revokeConsent?: () => void;
};

declare global {
  interface Window {
    gtag?: Gtag;
    fbq?: Fbq;
    ttq?: Ttq;
    dataLayer?: unknown[];
  }
}

/**
 * Eventos de conversión (navegador). Los nombres y cuándo se disparan:
 *
 *   Meta (fbq) y TikTok (ttq)  GA4 (dataLayer)   Cuándo
 *   ─────────────────────────  ────────────────  ───────────────────────────────
 *   ViewContent                view_promotion    página de campaña (BUEN FIN…)
 *   Lead                       sign_up           cuenta recién creada (paso del peludo)
 *   CompleteRegistration       registro_peludo   peludo registrado (alta o desde /app)
 *   InitiateCheckout           begin_checkout    se abre Stripe Checkout
 *   Purchase                   purchase          pago confirmado (bienvenida, /app)
 *
 * TikTok usa los mismos nombres: son sus eventos estándar vigentes (en 2025
 * renombró SubmitForm → Lead y CompletePayment → Purchase y pide los nuevos).
 *
 * Cada evento lleva su id (`eventID` en Meta, `event_id` en TikTok; ver
 * `src/lib/medicion/eventos.ts`): CompleteRegistration y Purchase también
 * salen del servidor (API de Conversiones de Meta, API de Eventos de TikTok)
 * con el MISMO id, y cada plataforma se queda con uno.
 *
 * Nada sale sin consentimiento: además de que los scripts no cargan sin un
 * «sí» (Analytics.tsx), cada función revisa la decisión antes de empujar
 * nada a `dataLayer` (si no, GA4 procesaría la cola al aceptar después).
 */
function medicionPermitida(): boolean {
  return typeof window !== "undefined" && leerConsentimiento() === "aceptado";
}

// GA4: se empuja a `dataLayer` en vez de llamar a `gtag`.
//
// La pantalla de bienvenida dispara la compra en cuanto monta, y los
// scripts de medición cargan con `afterInteractive` — es decir, DESPUÉS.
// Llamando `window.gtag?.()` la conversión se perdía en silencio (probado:
// el evento no llegaba a dataLayer). `gtag` no es más que
// `dataLayer.push(arguments)`, así que empujar directo funciona igual y
// GA4 procesa la cola cuando termina de cargar.
function enviarGA4(evento: string, parametros: Record<string, unknown>) {
  if (!GA4_ID) return;
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push(["event", evento, parametros]);
}

// Meta: su snippet crea `fbq` con cola propia, pero puede no existir
// todavía. No se puede inventar un stub (el snippet real hace
// `if (f.fbq) return;` y se quedaría con el nuestro, matando el píxel):
// se espera a que aparezca, con un tope para no dejar un reloj corriendo.
function enviarMeta(evento: string, parametros: Record<string, unknown>, eventID: string) {
  if (!META_PIXEL_ID) return;
  const enviar = () => window.fbq?.("track", evento, parametros, { eventID });
  if (window.fbq) {
    enviar();
    return;
  }
  let intentos = 0;
  const reloj = window.setInterval(() => {
    intentos++;
    if (window.fbq) {
      enviar();
      window.clearInterval(reloj);
    } else if (intentos >= 25) {
      // ~5 s: si el píxel no cargó (bloqueador, red), se deja de esperar
      window.clearInterval(reloj);
    }
  }, 200);
}

// TikTok: igual que Meta, se espera a que exista `ttq` (lo crea el snippet de
// Analytics.tsx, con cola propia) en vez de inventar uno: el snippet reutiliza
// un `ttq` previo y un stub nuestro no tendría sus métodos.
//
// COINCIDENCIA AVANZADA: APAGADA. No se llama `ttq.identify` (correo/teléfono
// cifrados): el aviso de privacidad promete que a TikTok no le llega nada de
// eso. Encenderla es decisión del equipo con su texto legal primero.
function enviarTikTok(evento: string, parametros: Record<string, unknown>, eventID: string) {
  if (!TIKTOK_PIXEL_ID) return;
  const enviar = () => window.ttq?.track(evento, parametros, { event_id: eventID });
  if (window.ttq) {
    enviar();
    return;
  }
  let intentos = 0;
  const reloj = window.setInterval(() => {
    intentos++;
    if (window.ttq) {
      enviar();
      window.clearInterval(reloj);
    } else if (intentos >= 25) {
      window.clearInterval(reloj);
    }
  }, 200);
}

/** `contents` de TikTok: el plan como producto. */
function contenidosTikTok(id: string | undefined) {
  return id ? [{ content_id: id, content_type: "product", quantity: 1 }] : undefined;
}

/**
 * Compra completada. `montoCentavos` es el cobro REAL que devolvió Stripe:
 * el valor no se escribe a mano en el código — un monto fijo hace que todo
 * reporte de campañas mienta en cuanto cambia un precio o entra un cupón.
 * `eventoId` = el que manda el webhook por la CAPI (`idCompraCheckout`).
 */
export function registrarCompra(datos: {
  montoCentavos: number;
  moneda: string;
  transaccion: string;
  eventoId: string;
  plan?: string;
}) {
  if (!medicionPermitida()) return;
  const value = Math.round(datos.montoCentavos) / 100;
  const currency = (datos.moneda || "mxn").toUpperCase();

  enviarGA4("purchase", {
    transaction_id: datos.transaccion,
    value,
    currency,
    items: datos.plan
      ? [
          {
            item_id: datos.plan,
            item_name: `Membresía ${datos.plan}`,
            price: value,
            quantity: 1,
          },
        ]
      : undefined,
  });
  enviarMeta(
    "Purchase",
    {
      value,
      currency,
      content_type: "product",
      content_ids: datos.plan ? [datos.plan] : undefined,
    },
    datos.eventoId,
  );
  enviarTikTok(
    "Purchase",
    { value, currency, content_type: "product", contents: contenidosTikTok(datos.plan) },
    datos.eventoId,
  );
}

/**
 * Vista de una página de campaña (ViewContent). Solo navegador y solo con
 * consentimiento; el PageView ya lo manda el píxel al cargar (Analytics.tsx).
 * Id propio: este evento no sale por la API de Conversiones.
 */
export function registrarVistaDeContenido(datos: { nombre: string; categoria?: string }) {
  if (!medicionPermitida()) return;
  enviarGA4("view_promotion", {
    promotion_name: datos.nombre,
    ...(datos.categoria ? { creative_name: datos.categoria } : {}),
  });
  const id = `vista-${crypto.randomUUID()}`;
  enviarMeta(
    "ViewContent",
    {
      content_name: datos.nombre,
      ...(datos.categoria ? { content_category: datos.categoria } : {}),
    },
    id,
  );
  enviarTikTok(
    "ViewContent",
    {
      description: datos.nombre,
      contents: [
        {
          content_id: datos.nombre,
          content_name: datos.nombre,
          ...(datos.categoria ? { content_category: datos.categoria } : {}),
        },
      ],
    },
    id,
  );
}

/** Cuenta recién creada (Lead). Solo navegador. */
export function registrarCuentaCreada(datos: { eventoId: string; metodo?: string }) {
  if (!medicionPermitida()) return;
  enviarGA4("sign_up", { method: datos.metodo ?? "email" });
  enviarMeta("Lead", { content_name: "Cuenta creada" }, datos.eventoId);
  enviarTikTok("Lead", { description: "Cuenta creada" }, datos.eventoId);
}

/**
 * Peludo registrado (CompleteRegistration). `eventoId` = `idRegistroPeludo`,
 * el mismo que manda la Server Action `medirPeludoRegistrado` por la CAPI.
 */
export function registrarPeludo(datos: {
  eventoId: string;
  origen: "registro" | "cuenta";
  especie?: string;
}) {
  if (!medicionPermitida()) return;
  enviarGA4("registro_peludo", { origen: datos.origen, especie: datos.especie });
  enviarMeta(
    "CompleteRegistration",
    { content_name: datos.origen === "registro" ? "Peludo · alta" : "Peludo · cuenta", status: true },
    datos.eventoId,
  );
  enviarTikTok(
    "CompleteRegistration",
    { description: datos.origen === "registro" ? "Peludo · alta" : "Peludo · cuenta" },
    datos.eventoId,
  );
}

/**
 * Se abre Stripe Checkout (InitiateCheckout). Devuelve una promesa que se
 * resuelve en ~300 ms: la página se va a Stripe justo después y, sin esa
 * pausa, el navegador puede cortar el envío del píxel. Solo navegador.
 */
export function registrarInicioDePago(
  datos: { eventoId: string; valorCentavos?: number; moneda?: string; contenidoId?: string } | undefined,
): Promise<void> {
  if (!datos?.eventoId || !medicionPermitida()) return Promise.resolve();
  const value =
    typeof datos.valorCentavos === "number" ? Math.round(datos.valorCentavos) / 100 : undefined;
  const currency = (datos.moneda || "mxn").toUpperCase();
  enviarGA4("begin_checkout", {
    value,
    currency,
    items: datos.contenidoId ? [{ item_id: datos.contenidoId, quantity: 1 }] : undefined,
  });
  enviarMeta(
    "InitiateCheckout",
    {
      value,
      currency,
      content_type: "product",
      content_ids: datos.contenidoId ? [datos.contenidoId] : undefined,
      num_items: 1,
    },
    datos.eventoId,
  );
  enviarTikTok(
    "InitiateCheckout",
    { value, currency, content_type: "product", contents: contenidosTikTok(datos.contenidoId) },
    datos.eventoId,
  );
  return window.fbq || window.ttq || window.dataLayer
    ? new Promise((listo) => window.setTimeout(listo, 300))
    : Promise.resolve();
}
