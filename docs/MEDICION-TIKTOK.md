# Medición de TikTok (píxel + API de Eventos)

*11-nov-2026.* TikTok se mide **igual que Meta**: mismo candado de cookies,
mismos momentos, mismo id de evento para que no se cuente dos veces. Sin las
variables de entorno no se carga nada.

## Variables de entorno

| Variable | Dónde | Qué es |
|---|---|---|
| `NEXT_PUBLIC_TIKTOK_PIXEL_ID` | Vercel (los dos ambientes) | Id del píxel. El de Pata Amiga: `DBQD4ORC77UASCMHFNO0`. Sin él no carga el píxel ni sale nada al servidor. |
| `TIKTOK_EVENTS_API_TOKEN` | Vercel, **secreta** | Token de la API de Eventos (servidor). Sin él solo funciona el píxel del navegador — es el estado esperado hasta que Fer lo genere. |
| `TIKTOK_TEST_EVENT_CODE` | Opcional | Manda los eventos del servidor a la pestaña «Probar eventos» en vez de contarlos como reales. **Quitarla al terminar de probar.** |

`NEXT_PUBLIC_*` se fija al compilar: después de cambiarla hay que volver a
desplegar.

### Dónde saca Fer el token

TikTok Ads Manager → **Herramientas → Eventos** (Administrador de eventos) →
el píxel → **Configuración** → *API de Eventos* → **Generar token de acceso**.
El token se pega directo en Vercel; no va en chats, correos ni en el repo.

## Qué se manda y cuándo

| Evento TikTok | Cuándo | Navegador | Servidor |
|---|---|---|---|
| `PageView` (`ttq.page()`) | cada carga, tras aceptar | sí | — |
| `ViewContent` | página de campaña (BUEN FIN…) | sí | — |
| `Lead` | cuenta recién creada | sí | — |
| `CompleteRegistration` | peludo registrado | sí | sí, mismo `event_id` |
| `InitiateCheckout` | se abre Stripe Checkout | sí | — |
| `Purchase` | pago confirmado | sí | sí, mismo `event_id` |

Son los nombres estándar **vigentes** de TikTok. En 2025 TikTok renombró
`SubmitForm` → `Lead` y `CompletePayment` → `Purchase`, y pide los nombres
nuevos en instalaciones nuevas (ayuda de TikTok Ads, «How to Adopt TikTok's
Updated Standard Events», mayo 2025). Coinciden uno a uno con los de Meta.

`Purchase` lleva `value` y `currency` con el **cobro real de Stripe**. Con la
promoción BUEN FIN el primer cobro del plan mensual es $0, así que esas compras
llegan con `value: 0` — es correcto, no un error.

Código: `src/lib/analytics.ts` (navegador), `src/components/analytics/Analytics.tsx`
(snippet), `src/lib/medicion/tiktok.ts` (cuerpo, puro y probado),
`tiktok-servidor.ts` (envío) y `conversiones-servidor.ts` (un evento → Meta y
TikTok).

## Privacidad

- **Nada sin «Aceptar» en el banner.** Ni script, ni cookie, ni petición a
  TikTok. Si la persona retira su «sí» sin recargar, se llama
  `ttq.revokeConsent()`.
- **Coincidencia avanzada APAGADA.** No se manda correo, teléfono ni id de
  usuario (ni cifrados), ni desde el navegador (`ttq.identify`) ni desde el
  servidor. Al servidor solo van IP, navegador, la cookie `_ttp` y el `ttclid`
  del anuncio. Prenderla requiere cambiar primero la política de cookies
  (punto 4.5), que hoy promete lo contrario.
- La política de cookies (`src/data/legal-texts.ts`, punto 4.5) describe el
  píxel de TikTok. **Ese texto necesita el visto bueno del equipo / despacho.**

## Etiquetas (UTM) recomendadas

En cada anuncio de TikTok, la URL de destino:

```
https://www.pataamiga.mx/<página>?utm_source=tiktok&utm_medium=paid&utm_campaign=<nombre>&utm_content=<anuncio>
```

TikTok agrega `ttclid` solo. Con `ttclid` o `utm_source=tiktok`, ventas ve en el
perfil del miembro **«Anuncio de TikTok · campaña <nombre>»**, y la exportación
de miembros (Admin → Exportar) trae las columnas *Origen de pauta* y *Clic de
TikTok (ttclid)*. Para un enlace orgánico (bio) usar `utm_medium=bio`: sale
como «TikTok», no como anuncio.

## Cómo probar

1. Poner `TIKTOK_TEST_EVENT_CODE` con el código que da la pestaña **Probar
   eventos** del Administrador de eventos (y desplegar).
2. Abrir el sitio, **aceptar cookies**, recorrer alta → peludo → pago con la
   tarjeta de prueba de Stripe (en pruebas).
3. En «Probar eventos» deben aparecer los eventos del navegador (Pixel Helper
   de TikTok también sirve) y, si ya hay token, los del servidor con el mismo
   `event_id`.
4. Rechazar cookies en otra ventana: no debe salir ninguna petición a
   `analytics.tiktok.com`.
5. Quitar `TIKTOK_TEST_EVENT_CODE` al terminar.
