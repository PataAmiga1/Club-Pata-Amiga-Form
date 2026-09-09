"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import {
  GA4_ID,
  META_PIXEL_ID,
  CLARITY_ID,
  clarityPermitidoEn,
} from "@/lib/analytics";
import { useConsentimiento } from "./useConsentimiento";

/**
 * Carga GA4, el píxel de Meta y Clarity — SOLO si sus llaves están configuradas
 * Y la persona aceptó.
 *
 * Dos candados, en este orden:
 *
 * 1. **Sin llaves no se carga nada.** El sitio no manda una sola petición a
 *    Google, Meta ni Microsoft mientras el equipo no configure las variables.
 * 2. **Sin un "sí" explícito, tampoco.** La política de cookies dice que las
 *    opcionales «se activan solo si aceptas»; cargarlas antes de preguntar
 *    volvería falsa esa frase. Mientras no haya decisión, esto no pinta nada.
 *
 * Clarity además es distinto a los otros dos: no cuenta visitas, GRABA LA
 * SESIÓN. Por eso no carga en las rutas privadas (ver
 * `CLARITY_RUTAS_EXCLUIDAS`), donde la pantalla trae CURP, INE, cuentas
 * bancarias y datos del peludo — ahí ni siquiera aceptando.
 */
export function Analytics() {
  const ruta = usePathname() ?? "/";
  const consentimiento = useConsentimiento();
  const cargarClarity = Boolean(CLARITY_ID) && clarityPermitidoEn(ruta);

  if (consentimiento !== "aceptado") return null;
  if (!GA4_ID && !META_PIXEL_ID && !cargarClarity) return null;

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
