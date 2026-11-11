"use client";

import { useEffect } from "react";
import Script from "next/script";
import { usePathname } from "next/navigation";
import {
  GA4_ID,
  META_PIXEL_ID,
  TIKTOK_PIXEL_ID,
  CLARITY_ID,
  clarityPermitidoEn,
} from "@/lib/analytics";
import { useConsentimiento } from "./useConsentimiento";

/**
 * Si la persona retira su «sí» sin recargar la página (pie de página →
 * «Configurar cookies»), el script de TikTok ya cargado seguiría vivo: dejar
 * de pintarlo no lo descarga. `revokeConsent` le ordena dejar de mandar
 * eventos (comprobado: tras rechazar, navegar no manda nada) y se borran sus
 * cookies; si vuelve a aceptar en la misma página, `grantConsent` lo reanuda
 * (next/script no vuelve a ejecutar un snippet con el mismo id).
 */
let tiktokRevocado = false;

/**
 * Las cookies propias que deja el píxel de TikTok. Revocar solo detiene los
 * envíos; las cookies se borran aquí. El píxel puede escribirlas en el
 * dominio raíz (`.pataamiga.mx`), así que se borran con y sin dominio.
 */
function borrarCookiesTikTok() {
  try {
    const partes = window.location.hostname.split(".");
    const dominios = [
      "",
      `; Domain=${window.location.hostname}`,
      ...(partes.length > 2 ? [`; Domain=.${partes.slice(-2).join(".")}`] : []),
    ];
    for (const nombre of ["_ttp", "ttclid", "_tt_enable_cookie"])
      for (const dominio of dominios) document.cookie = `${nombre}=; Max-Age=0; Path=/${dominio}`;
  } catch {
    /* cookies bloqueadas: no hay nada que borrar */
  }
}

/**
 * Carga GA4, el píxel de Meta, el de TikTok y Clarity — SOLO si sus llaves
 * están configuradas Y la persona aceptó.
 *
 * Dos candados, en este orden:
 *
 * 1. **Sin llaves no se carga nada.** El sitio no manda una sola petición a
 *    Google, Meta, TikTok ni Microsoft mientras el equipo no configure las
 *    variables.
 * 2. **Sin un "sí" explícito, tampoco.** La política de cookies dice que las
 *    opcionales «se activan solo si aceptas»; cargarlas antes de preguntar
 *    volvería falsa esa frase. Mientras no haya decisión, esto no pinta nada.
 *
 * Clarity además es distinto a los otros: no cuenta visitas, GRABA LA
 * SESIÓN. Por eso no carga en las rutas privadas (ver
 * `CLARITY_RUTAS_EXCLUIDAS`), donde la pantalla trae CURP, INE, cuentas
 * bancarias y datos del peludo — ahí ni siquiera aceptando.
 */
export function Analytics() {
  const ruta = usePathname() ?? "/";
  const consentimiento = useConsentimiento();
  const cargarClarity = Boolean(CLARITY_ID) && clarityPermitidoEn(ruta);

  useEffect(() => {
    if (!TIKTOK_PIXEL_ID) return;
    // Un «no» también limpia lo que haya quedado de una visita anterior.
    if (consentimiento === "rechazado") borrarCookiesTikTok();
    const ttq = window.ttq;
    if (!ttq) return;
    if (consentimiento !== "aceptado") {
      ttq.revokeConsent?.();
      tiktokRevocado = true;
      borrarCookiesTikTok();
    } else if (tiktokRevocado) {
      ttq.grantConsent?.();
      tiktokRevocado = false;
    }
  }, [consentimiento]);

  if (consentimiento !== "aceptado") return null;
  if (!GA4_ID && !META_PIXEL_ID && !TIKTOK_PIXEL_ID && !cargarClarity) return null;

  return (
    <>
      {GA4_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA4_ID}`}
            strategy="afterInteractive"
          />
          <Script id="ga4-init" strategy="afterInteractive">
            {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('config', '${GA4_ID}');`}
          </Script>
        </>
      )}

      {META_PIXEL_ID && (
        <>
          <Script id="meta-pixel" strategy="afterInteractive">
            {`!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`}
          </Script>
          <noscript>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              height="1"
              width="1"
              style={{ display: "none" }}
              alt=""
              src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
            />
          </noscript>
        </>
      )}

      {TIKTOK_PIXEL_ID && (
        // Snippet base oficial de TikTok (ttq.load + ttq.page). Sin
        // `ttq.identify`: la coincidencia avanzada está apagada (ver
        // src/lib/analytics.ts).
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`!function (w, d, t) {
w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie","holdConsent","revokeConsent","grantConsent"],ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e},ttq.load=function(e,n){var r="https://analytics.tiktok.com/i18n/pixel/events.js",o=n&&n.partner;ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=r,ttq._t=ttq._t||{},ttq._t[e]=+new Date,ttq._o=ttq._o||{},ttq._o[e]=n||{};n=d.createElement("script");n.type="text/javascript",n.async=!0,n.src=r+"?sdkid="+e+"&lib="+t;e=d.getElementsByTagName("script")[0];e.parentNode.insertBefore(n,e)};
ttq.load('${TIKTOK_PIXEL_ID}');
ttq.page();
}(window, document, 'ttq');`}
        </Script>
      )}

      {cargarClarity && (
        <Script id="ms-clarity" strategy="afterInteractive">
          {`(function(c,l,a,r,i,t,y){
c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
})(window, document, "clarity", "script", "${CLARITY_ID}");`}
        </Script>
      )}
    </>
  );
}
