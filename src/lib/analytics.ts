/**
 * Medición: Google Analytics 4 y el píxel de Meta.
 *
 * CONECTAR: las dos llaves son variables de entorno públicas y el equipo las
 * pone cuando tenga las cuentas. **Sin ellas no se carga NADA** — ni scripts,
 * ni cookies de terceros, ni peticiones a Google o Meta. Así el sitio no
 * arrastra rastreadores mientras no exista la decisión de usarlos:
 *
 *   NEXT_PUBLIC_GA4_ID         G-XXXXXXXXXX
 *   NEXT_PUBLIC_META_PIXEL_ID  1234567890
 *
 * Se leen con `process.env.NEXT_PUBLIC_*` escrito completo a propósito: Next
 * sustituye estas expresiones en tiempo de compilación y un acceso dinámico
 * (`process.env[nombre]`) llegaría vacío al navegador.
 */
export const GA4_ID = process.env.NEXT_PUBLIC_GA4_ID ?? "";
export const META_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

export function medicionActiva(): boolean {
  return Boolean(GA4_ID || META_PIXEL_ID);
}

type Gtag = (...args: unknown[]) => void;
type Fbq = (...args: unknown[]) => void;

declare global {
  interface Window {
    gtag?: Gtag;
    fbq?: Fbq;
    dataLayer?: unknown[];
  }
}

/**
 * Compra completada. `montoCentavos` es el cobro REAL que devolvió Stripe:
 * el valor no se escribe a mano en el código — un monto fijo hace que todo
 * reporte de campañas mienta en cuanto cambia un precio o entra un cupón.
 */
export function registrarCompra(datos: {
  montoCentavos: number;
  moneda: string;
  transaccion: string;
  plan?: string;
}) {
  if (typeof window === "undefined") return;
  const value = Math.round(datos.montoCentavos) / 100;
  const currency = (datos.moneda || "mxn").toUpperCase();

  // GA4: se empuja a `dataLayer` en vez de llamar a `gtag`.
  //
  // La pantalla de bienvenida dispara la compra en cuanto monta, y los
  // scripts de medición cargan con `afterInteractive` — es decir, DESPUÉS.
  // Llamando `window.gtag?.()` la conversión se perdía en silencio (probado:
  // el evento no llegaba a dataLayer). `gtag` no es más que
  // `dataLayer.push(arguments)`, así que empujar directo funciona igual y
  // GA4 procesa la cola cuando termina de cargar.
  window.dataLayer = window.dataLayer || [];
  window.dataLayer.push([
    "event",
    "purchase",
    {
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
    },
  ]);

  // Meta: su snippet crea `fbq` con cola propia, pero puede no existir
  // todavía. No se puede inventar un stub (el snippet real hace
  // `if (f.fbq) return;` y se quedaría con el nuestro, matando el píxel):
  // se espera a que aparezca, con un tope para no dejar un reloj corriendo.
  const enviarMeta = () => {
    window.fbq?.("track", "Purchase", {
      value,
      currency,
      content_type: "product",
      content_ids: datos.plan ? [datos.plan] : undefined,
    });
  };
  if (window.fbq) {
    enviarMeta();
  } else {
    let intentos = 0;
    const reloj = window.setInterval(() => {
      intentos++;
      if (window.fbq) {
        enviarMeta();
        window.clearInterval(reloj);
      } else if (intentos >= 25) {
        // ~5 s: si el píxel no cargó (bloqueador, red), se deja de esperar
        window.clearInterval(reloj);
      }
    }, 200);
  }
}
