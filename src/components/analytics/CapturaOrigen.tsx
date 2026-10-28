"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  COOKIE_ATRIBUCION,
  DIAS_COOKIE_ATRIBUCION,
  combinarToques,
  fbcDesdeFbclid,
  leerAtribucion,
  serializarAtribucion,
  toqueDesdeUrl,
  type Toque,
} from "@/lib/atribucion";
import { sincronizarCookieMedicion } from "@/lib/consentimiento";
import { useConsentimiento } from "./useConsentimiento";

/**
 * Guarda de qué campaña llegó la persona (`utm_*`, `fbclid`, `gclid`) en la
 * cookie propia `pa_origen`, para ligarla a su cuenta cuando se registre.
 *
 * Va bajo el MISMO candado que el píxel (política de cookies, 3.C: la
 * atribución es marketing y «se activa solo si aceptas»):
 *  · sin decisión todavía → el aterrizaje se recuerda en MEMORIA de la pestaña
 *    (no se escribe cookie ni localStorage). Si la persona acepta después —ya
 *    navegando, sin los parámetros en la URL— se guarda en ese momento;
 *  · aceptado → se guarda directo, y si trae `fbclid` y el píxel aún no creó
 *    `_fbc`, se crea con el formato de Meta (sirve a la API de Conversiones);
 *  · rechazado → se tira lo pendiente y se borra la cookie si existía.
 *
 * También mantiene la cookie espejo `pa_medicion` para quien aceptó antes de
 * que existiera (la decisión vive en localStorage, el servidor no la ve).
 *
 * No pinta nada. El servidor lee la atribución al crear la cuenta
 * (`guardarAtribucionDelMiembro`).
 */
let pendiente: Toque | null = null;

function leerCookie(nombre: string): string | null {
  const par = document.cookie.split("; ").find((c) => c.startsWith(`${nombre}=`));
  return par ? par.slice(nombre.length + 1) : null;
}

function escribirCookie(nombre: string, valor: string, dias: number) {
  const seguro = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${nombre}=${valor}; Max-Age=${dias * 86_400}; Path=/; SameSite=Lax${seguro}`;
}

function guardar(toque: Toque) {
  try {
    const previa = leerAtribucion(leerCookie(COOKIE_ATRIBUCION));
    escribirCookie(
      COOKIE_ATRIBUCION,
      serializarAtribucion(combinarToques(previa, toque)),
      DIAS_COOKIE_ATRIBUCION,
    );
    if (toque.fbclid && !leerCookie("_fbc"))
      escribirCookie("_fbc", fbcDesdeFbclid(toque.fbclid, Date.parse(toque.ts)), 90);
  } catch {
    // Cookies bloqueadas: se pierde la atribución, el sitio sigue igual.
  }
}

export function CapturaOrigen() {
  const ruta = usePathname();
  const consentimiento = useConsentimiento();

  // Cada aterrizaje (carga o navegación) con parámetros de campaña.
  useEffect(() => {
    const toque = toqueDesdeUrl(window.location.search, {
      ahora: new Date(),
      pagina: window.location.pathname,
      referente: document.referrer || undefined,
    });
    if (toque) pendiente = toque;
  }, [ruta]);

  // Se escribe solo con un «sí»; con un «no», se borra todo.
  useEffect(() => {
    if (consentimiento === null) return;
    sincronizarCookieMedicion(consentimiento);
    if (consentimiento === "aceptado") {
      if (pendiente) guardar(pendiente);
      pendiente = null;
    } else {
      pendiente = null;
      try {
        if (leerCookie(COOKIE_ATRIBUCION) !== null) escribirCookie(COOKIE_ATRIBUCION, "", 0);
      } catch {
        /* nada que borrar */
      }
    }
  }, [consentimiento, ruta]);

  return null;
}
