"use client";

import { useEffect, useRef } from "react";
import { TextField } from "@/components/ui/Field";

/**
 * Campo de dirección con autocompletado de Google Places (México). Al escribir
 * muestra el dropdown de Google y, al elegir, rellena calle, CP, colonia,
 * ciudad y estado. Los centros de bienestar pueden elegir su propio negocio.
 *
 * CONECTAR: requiere NEXT_PUBLIC_GOOGLE_MAPS_API_KEY (Places API habilitada en
 * la cuenta de Google Cloud del cliente, con restricción por dominio). Sin la
 * llave, el campo funciona como texto normal — sin dropdown, sin romper nada.
 */

export type ParsedAddress = {
  address: string; // calle y número
  postalCode: string;
  colony: string;
  city: string;
  state: string;
  placeName?: string; // nombre del negocio, si eligió un establecimiento
};

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onPlaceSelect: (parsed: ParsedAddress) => void;
  required?: boolean;
};

/**
 * Rescate cuando la llave de Google está mal (facturación apagada, dominio no
 * autorizado, API deshabilitada): el script de Google DESHABILITA el input y
 * le pone "Oops! Something went wrong." — el usuario ya no puede ni teclear su
 * dirección a mano. Google avisa por `gm_authFailure`; aquí lo usamos para
 * devolver los campos a texto normal. Diagnóstico del 11-ago: la llave actual
 * responde REQUEST_DENIED por facturación sin habilitar en el proyecto de
 * Google Cloud — eso arregla el autocompletado; esto arregla que mientras
 * tanto el campo no se muera.
 */
const inputsRegistrados = new Set<HTMLInputElement>();
function instalarRescateAuth() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (w.__pataAmigaGmRescate) return;
  w.__pataAmigaGmRescate = true;
  w.gm_authFailure = () => {
    for (const input of inputsRegistrados) {
      input.disabled = false;
      input.placeholder = "Escribe tu dirección (calle y número)";
      input.style.backgroundImage = "none";
    }
  };
}

// Carga del script de Google Maps una sola vez para toda la app.
let mapsPromise: Promise<void> | null = null;
function loadGoogleMaps(key: string): Promise<void> {
  if (mapsPromise) return mapsPromise;
  mapsPromise = new Promise((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if ((window as any).google?.maps?.places) return resolve();
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places&language=es&region=MX`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("No se pudo cargar Google Maps"));
    document.head.appendChild(script);
  });
  return mapsPromise;
}

/** Extrae los campos de dirección de un PlaceResult de Google. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsePlace(place: any): ParsedAddress {
  const get = (type: string, short = false) => {
    const c = (place.address_components ?? []).find((comp: { types: string[] }) =>
      comp.types.includes(type),
    );
    return c ? (short ? c.short_name : c.long_name) : "";
  };
  const streetNumber = get("street_number");
  const route = get("route");
  return {
    address: [route, streetNumber].filter(Boolean).join(" "),
    postalCode: get("postal_code"),
    colony:
      get("sublocality_level_1") || get("neighborhood") || get("sublocality"),
    city:
      get("locality") ||
      get("administrative_area_level_2") ||
      get("administrative_area_level_3"),
    state: get("administrative_area_level_1"),
    placeName: place.name,
  };
}

export function AddressAutocomplete({
  label,
  value,
  onChange,
  onPlaceSelect,
  required,
}: Props) {
  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!key || !inputRef.current) return;
    let autocomplete: unknown;
    let cancelled = false;

    const input = inputRef.current;
    inputsRegistrados.add(input);
    instalarRescateAuth();

    loadGoogleMaps(key)
      .then(() => {
        if (cancelled || !inputRef.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const g = (window as any).google;
        autocomplete = new g.maps.places.Autocomplete(inputRef.current, {
          componentRestrictions: { country: "mx" },
          fields: ["address_components", "name", "formatted_address"],
          // sin filtro de types → incluye negocios (establishment) y direcciones
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (autocomplete as any).addListener("place_changed", () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const place = (autocomplete as any).getPlace();
          if (!place?.address_components) return;
          const parsed = parsePlace(place);
          // Refleja la calle en el input; el resto se llena por onPlaceSelect
          if (parsed.address) onChange(parsed.address);
          onPlaceSelect(parsed);
        });
      })
      .catch(() => {
        /* sin autocompletado; el campo sigue siendo texto normal */
      });

    return () => {
      cancelled = true;
      inputsRegistrados.delete(input);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (
    <TextField
      inputRef={inputRef}
      label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      placeholder={key ? "Empieza a escribir tu dirección o negocio…" : undefined}
      autoComplete="off"
    />
  );
}
