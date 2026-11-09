import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { headers } from "next/headers";
import { Poppins } from "next/font/google";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isStaff, type Role } from "@/lib/permissions";
import { MEMBERSHIP_FEATURES_599 } from "@/lib/constants";
import { ALTAS_SON_599 } from "@/lib/plans/planes";
import { ofertaPublica599, type Oferta599 } from "@/lib/plans/oferta";
import { pesosDeOferta } from "@/lib/plans/oferta-texto";
import { registroAbierto } from "@/lib/registro";
import {
  BUEN_FIN,
  CIFRAS_DE_PAUTA,
  cuadraConLaPauta,
  cuentasBuenFin,
  enlaceDeRegistro,
  estadoDeLaCampana,
  vistaForzada,
  type EstadoCampana,
} from "@/lib/campanas/buen-fin";
import { VistaBuenFin } from "./VistaBuenFin";

/**
 * EL ENLACE DE EL BUEN FIN 2026 (13–17 nov). Lo abren los anuncios, las
 * stories y WhatsApp. La persona elige mes a mes o anual y el botón la lleva al
 * registro con la modalidad y el código ya puestos (`enlaceDeRegistro`).
 *
 * Lenguaje visual: el de la campaña aprobada (story «¿Cómo contrato?»): crema,
 * verde petróleo, turquesa; Fraiche en titulares y cifras, Poppins en el
 * cuerpo. Las dos opciones pesan lo mismo a propósito: en el primer año cuestan
 * igual y la pauta no puede vender el anual como más barato.
 *
 * Las cifras salen de la versión publicada del plan, nunca de la pauta. Si no
 * cuadran con lo que prometen los anuncios, la vista de QA lo avisa.
 *
 * QA: `?vista=antes|activa|terminada` fuerza un estado. Solo se respeta fuera
 * de pataamiga.mx (local, staging) o con sesión del equipo.
 */

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-poppins",
});

const C = {
  crema: "#EDE6D5",
  petroleo: "#015659",
  turquesa: "#00BFB3",
  turquesaClaro: "#64BCB6",
};

export const metadata: Metadata = {
  title: "El Buen Fin 2026 · Pata Amiga",
  // Sin cifras: los precios salen de la versión publicada y aquí no se pueden
  // leer sin volver dinámica la etiqueta. Las cifras van en la página.
  description:
    "Del 13 al 17 de noviembre, con el código BUENFIN: elige mes a mes o anual para tu membresía de salud para mascotas. Un código. Tú eliges cómo pagar.",
  alternates: { canonical: BUEN_FIN.ruta },
  openGraph: {
    title: "El Buen Fin 2026: La cuenta de Pata Amiga",
    description:
      "Un código. Tú eliges cómo pagar: mes a mes o anual. Código BUENFIN, del 13 al 17 de noviembre.",
    url: BUEN_FIN.ruta,
    siteName: "Pata Amiga",
    locale: "es_MX",
    type: "website",
  },
};

type Busqueda = Record<string, string | string[] | undefined>;

async function fueraDeProduccion(): Promise<boolean> {
  const host = ((await headers()).get("host") ?? "").toLowerCase();
  return !host.endsWith("pataamiga.mx");
}

/** `?vista=` solo para QA: fuera de producción o con sesión del equipo. */
async function vistaPermitida(): Promise<boolean> {
  if (await fueraDeProduccion()) return true;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    return isStaff((data?.role ?? null) as Role | null);
  } catch {
    return false;
  }
}

export default async function BuenFinPage({
  searchParams,
}: {
  searchParams: Promise<Busqueda>;
}) {
  const busqueda = await searchParams;
  const forzada = vistaForzada(busqueda.vista);
  const qa = forzada !== null && (await vistaPermitida());
  const estado: EstadoCampana = qa && forzada ? forzada : estadoDeLaCampana();

  // Precios reales: los mismos que cobra el checkout.
  const admin = createAdminClient();
  const [oferta, abierto] = await Promise.all([
    ALTAS_SON_599 ? ofertaPublica599(admin) : Promise.resolve(null),
    registroAbierto(),
  ]);
  const principal: Oferta599 | null = oferta?.principal ?? null;
  const c = cuentasBuenFin(
    principal
      ? { mensualPesos: principal.mensualPesos, anualPesos: principal.anualPesos }
      : { mensualPesos: CIFRAS_DE_PAUTA.mensualPesos, anualPesos: CIFRAS_DE_PAUTA.anualRegularPesos },
  );
  const cuadra = principal !== null && cuadraConLaPauta(c);
  if (principal && !cuadra)
    console.warn("[buenfin] los precios publicados no dan las cifras de la pauta", c);
  // Sin precio publicado o con el registro cerrado, no se vende: los botones
  // llevarían a un checkout que se niega.
  const sePuedeContratar = principal !== null && abierto;
  const $ = pesosDeOferta;
  // La comparación honesta de la pauta («las dos suman lo mismo el primer
  // año») solo se dice si los precios reales la hacen verdad.
  const mismoPrimerAnio = c.primerAnioMensual === c.anualBuenFin;

  const enlaceMensual = enlaceDeRegistro("mensual", busqueda);
  const enlaceAnual = enlaceDeRegistro("anual", busqueda);

  return (
    <div
      className={`${poppins.variable} flex min-h-dvh flex-col`}
      style={{ background: C.crema, color: C.petroleo, fontFamily: "var(--font-poppins), sans-serif" }}
    >
      <VistaBuenFin estado={estado} />

      {(qa || (!cuadra && (await fueraDeProduccion()))) && (
        <div className="bg-[#1e1e1e] px-4 py-2 text-center text-[12px] text-white">
          Solo para el equipo · vista «{estado}». {principal ? "" : "Sin precio publicado del plan $599 — se muestran las cifras de la pauta. "}
          {principal && !cuadra
            ? `⚠ Los precios publicados (${$(c.mensual)}/mes, ${$(c.anualRegular)}/año) NO dan las cifras de la pauta (${$(CIFRAS_DE_PAUTA.mensualPesos)}/mes, ${$(CIFRAS_DE_PAUTA.anualRegularPesos)}/año). `
            : ""}
          {!abierto ? "Registro cerrado en Ajustes del sitio. " : ""}
        </div>
      )}

      {/* Encabezado */}
      <header className="mx-auto flex w-full max-w-[1040px] items-center justify-between px-4 pt-5 sm:px-6">
        <Link href="/" aria-label="Pata Amiga — inicio">
          <Image src="/brand/logo-light-bg.svg" alt="Pata Amiga" width={132} height={44} priority />
        </Link>
        <span
          className="rounded-full px-3 py-1.5 text-[12px] font-semibold"
          style={{ background: "white", color: C.petroleo }}
        >
          El Buen Fin 2026
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[1040px] flex-col gap-12 px-4 pb-16 pt-8 sm:gap-16 sm:px-6 sm:pt-12">
        {/* Hero */}
        <section className="flex flex-col gap-5">
          <p className="text-[13px] font-semibold uppercase tracking-[.12em]" style={{ color: C.turquesaClaro }}>
            El Buen Fin 2026
          </p>
          <h1 className="font-display text-[40px] leading-[1.02] sm:text-[64px]">
            La cuenta de Pata Amiga
          </h1>
          <p className="font-display text-[24px] leading-tight sm:text-[30px]" style={{ color: C.turquesa }}>
            {BUEN_FIN.mensaje}
          </p>
          <p className="max-w-[620px] text-[15.5px] leading-relaxed sm:text-[17px]">
            Tu membresía de salud para mascotas, mes a mes o anual.
            {mismoPrimerAnio
              ? " En el primer año las dos suman lo mismo: tú decides cómo organizas el pago."
              : " Tú decides cómo organizas el pago."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="font-display rounded-[14px] px-5 py-2.5 text-[26px] tracking-[.08em] text-white sm:text-[32px]"
              style={{ background: C.petroleo }}
            >
              {BUEN_FIN.codigo}
            </span>
            <span className="flex items-center gap-2 text-[15px] font-semibold">
              <IconoCalendario />
              {BUEN_FIN.fechasEnTexto} de 2026
            </span>
          </div>
          <AvisoDeEstado estado={estado} sePuedeContratar={sePuedeContratar} />
        </section>

        {/* Las dos opciones, con el mismo peso */}
        {estado !== "terminada" && (
          <section aria-labelledby="opciones" className="flex flex-col gap-5">
            <h2 id="opciones" className="font-display text-[30px] sm:text-[38px]">
              Elige cómo pagar
            </h2>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Opcion
                letra="A"
                titulo="Mes a mes"
                cifra={$(c.primerMes)}
                cifraNota="tu primer mes con BUENFIN"
                detalle={
                  <>
                    Después, <strong>{$(c.mensual)} al mes</strong>.
                  </>
                }
                renglones={[
                  "Una mascota · IVA incluido",
                  "Paga con tarjeta de débito o crédito",
                  "Sin plazo forzoso: cancelas cuando quieras",
                ]}
                boton="Elegir mes a mes"
                href={enlaceMensual}
                activo={estado === "activa" && sePuedeContratar}
              />
              <Opcion
                letra="B"
                titulo="Anual"
                cifra={$(c.anualBuenFin)}
                cifraNota="12 meses con BUENFIN"
                detalle={
                  <>
                    Precio regular <s className="opacity-70">{$(c.anualRegular)}</s> ·{" "}
                    <strong>ahorras {$(c.ahorroAnual)}</strong>
                  </>
                }
                renglones={[
                  "Una mascota · IVA incluido",
                  "Una sola exhibición con débito o crédito",
                  "O 3 o 6 meses sin intereses con tarjetas de crédito participantes, según las condiciones de tu tarjeta",
                ]}
                boton="Elegir anual"
                href={enlaceAnual}
                activo={estado === "activa" && sePuedeContratar}
              />
            </div>
          </section>
        )}

        {/* Comparación transparente */}
        {estado !== "terminada" && (
          <section aria-labelledby="cuenta" className="flex flex-col gap-4">
            <h2 id="cuenta" className="font-display text-[30px] sm:text-[38px]">
              Haz la cuenta
            </h2>
            <div className="grid grid-cols-1 gap-4 rounded-[20px] bg-white p-5 sm:grid-cols-2 sm:p-7">
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-semibold uppercase tracking-[.08em]" style={{ color: C.turquesaClaro }}>
                  Mes a mes · primer año
                </span>
                <span className="font-display text-[24px] leading-snug sm:text-[28px]">
                  {$(c.primerMes)} + 11 × {$(c.mensual)} = {$(c.primerAnioMensual)}
                </span>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-[13px] font-semibold uppercase tracking-[.08em]" style={{ color: C.turquesaClaro }}>
                  Anual · 12 meses
                </span>
                <span className="font-display text-[24px] leading-snug sm:text-[28px]">
                  {$(c.anualBuenFin)}
                </span>
              </div>
              <p className="text-[14px] leading-relaxed sm:col-span-2">
                {mismoPrimerAnio
                  ? `En el primer año las dos modalidades cuestan lo mismo. El ahorro de ${$(c.ahorroAnual)} del anual es frente a su precio regular de ${$(c.anualRegular)}; no es más barato que pagar mes a mes ese primer año. `
                  : `El ahorro de ${$(c.ahorroAnual)} del anual es frente a su precio regular de ${$(c.anualRegular)}. `}
                La membresía es la misma: cambia cómo organizas el pago.
              </p>
            </div>
          </section>
        )}

        {/* Cómo contratar — espejo de la story */}
        {estado !== "terminada" && (
          <section aria-labelledby="como" className="flex flex-col gap-4">
            <h2 id="como" className="font-display text-[30px] sm:text-[38px]">
              ¿Cómo contrato?
            </h2>
            <p className="text-[14.5px] leading-relaxed">
              Entra con el botón de tu opción, crea tu cuenta y registra a tu
              peludo. Después:
            </p>
            <ol className="flex max-w-[620px] flex-col gap-3">
              <Paso n={1} texto="Selecciona tu modalidad.">
                <span className="flex rounded-full p-1 text-[12px] font-semibold" style={{ background: C.crema }}>
                  <span className="rounded-full px-3 py-1">Anual</span>
                  <span className="rounded-full px-3 py-1 text-white" style={{ background: C.petroleo }}>
                    Mes a mes
                  </span>
                </span>
              </Paso>
              <Paso n={2} texto={`Ingresa ${BUEN_FIN.codigo}.`}>
                <span
                  className="flex items-center gap-2 rounded-[10px] border-2 px-3 py-1.5 text-[14px] font-bold tracking-[.12em]"
                  style={{ borderColor: C.petroleo }}
                >
                  {BUEN_FIN.codigo}
                  <span
                    aria-hidden
                    className="grid size-5 place-items-center rounded-full text-[11px] text-white"
                    style={{ background: C.turquesa }}
                  >
                    ✓
                  </span>
                </span>
              </Paso>
              <Paso n={3} texto="Paga con débito o crédito." />
            </ol>
            <p className="text-[13.5px] leading-relaxed opacity-80">
              Si entras desde esta página, el código ya va puesto: antes de pagar
              ves cuánto pagas hoy y cuánto después.
            </p>
          </section>
        )}

        {/* Lo que incluye */}
        <section aria-labelledby="incluye" className="flex flex-col gap-4">
          <h2 id="incluye" className="font-display text-[30px] sm:text-[38px]">
            Qué incluye tu membresía
          </h2>
          {principal ? (
            <>
              <p className="text-[14.5px] leading-relaxed">
                Montos por peludo y por año. Se renuevan cada año y no se
                acumulan. Te reintegramos lo que pagaste a tu veterinario en
                máximo {principal.diasHabiles} días hábiles.
              </p>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                <Rubro
                  titulo="Emergencias graves"
                  cifra={`Desde ${$(principal.emergencia.inicial)}`}
                  texto={`Al año, a partir del mes ${principal.emergencia.aperturaMes}. Tu monto crece cada mes pagado hasta ${$(principal.emergencia.tope)} al año. Hospital, cirugía, estudios y medicinas.`}
                />
                <Rubro
                  titulo="Cuidados cotidianos"
                  cifra={`De ${$(principal.cuidados.inicial)} a ${$(principal.cuidados.tope)}`}
                  texto={`Al año, a partir del día ${principal.cuidados.aperturaDia}; crece cada mes pagado. Consultas, vacunas, desparasitación y dental.`}
                />
                <Rubro
                  titulo="Despedida"
                  cifra={$(principal.despedida.monto)}
                  texto={`A partir del día ${principal.despedida.aperturaDia}.`}
                />
              </div>
              <div className="rounded-[20px] bg-white p-5 sm:p-6">
                <h3 className="font-display text-[22px]">Tiempos de espera</h3>
                <p className="mt-2 text-[14.5px] leading-relaxed">
                  Los montos no están disponibles desde el primer día: cuentan desde
                  que el comité aprueba a tu peludo. Cuidados cotidianos desde el día{" "}
                  {principal.cuidados.aperturaDia}, despedida desde el día{" "}
                  {principal.despedida.aperturaDia} y emergencias graves desde el mes{" "}
                  {principal.emergencia.aperturaMes}. La orientación veterinaria 24/7
                  la tienes desde el primer día.
                </p>
              </div>
            </>
          ) : (
            <p className="text-[14.5px] leading-relaxed">
              Reintegros para emergencias graves, cuidados cotidianos y despedida,
              con el veterinario que tú elijas. Los montos y tiempos de espera
              están en el Reglamento de reintegros.
            </p>
          )}
          <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {[
              ...MEMBERSHIP_FEATURES_599,
              "Sin copago: no pagas nada extra al usar tu beneficio",
              "Sin límite de edad*",
            ].map((t) => (
              <li key={t} className="flex gap-2.5 text-[14.5px] leading-snug">
                <span aria-hidden className="font-bold" style={{ color: C.turquesa }}>
                  ✓
                </span>
                {t === "Disponible en todo México" ? "Alcance en todo México" : t}
              </li>
            ))}
          </ul>
          <p className="text-[12.5px] leading-relaxed opacity-80">
            *No hay edad máxima, pero los peludos de 8 años o más necesitan un
            certificado veterinario para ser aprobados.
          </p>
        </section>

        {/* Preguntas */}
        <section aria-labelledby="preguntas" className="flex flex-col gap-3">
          <h2 id="preguntas" className="font-display text-[30px] sm:text-[38px]">
            Preguntas frecuentes
          </h2>
          {preguntas(c, principal).map(([p, r]) => (
            <details key={p} className="group rounded-[16px] bg-white px-5 py-4">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[15px] font-semibold">
                {p}
                <span aria-hidden className="transition-transform group-open:rotate-180" style={{ color: C.turquesa }}>
                  ▾
                </span>
              </summary>
              <p className="mt-2.5 text-[14.5px] leading-relaxed">{r}</p>
            </details>
          ))}
        </section>

        {/* QR oficial + legales */}
        <section className="flex flex-col-reverse gap-6 sm:flex-row sm:items-end sm:justify-between">
          <p className="max-w-[640px] text-[12px] leading-relaxed opacity-80">
            Promoción válida del 13 al 17 de noviembre de 2026, hasta las 23:59 h
            del centro de México, con el código {BUEN_FIN.codigo}, en la membresía
            del primer peludo de la cuenta. Mes a mes: el primer mes cuesta{" "}
            {$(c.primerMes)} y desde el segundo, {$(c.mensual)} al mes por peludo.
            Anual: {$(c.anualBuenFin)} por 12 meses; al renovar aplica el precio
            regular vigente. Precios en pesos mexicanos, IVA incluido. Meses sin
            intereses solo en anual, con tarjetas de crédito participantes y según
            las condiciones de tu banco. No acumulable con otros códigos de
            promoción. Los reintegros aplican después de los tiempos de espera y
            conforme al{" "}
            <Link href="/legales/reglamento-de-reintegros" className="underline">
              Reglamento de reintegros
            </Link>{" "}
            y los{" "}
            <Link href="/legales/terminos-y-condiciones" className="underline">
              Términos y condiciones
            </Link>
            . Pata Amiga es una membresía de salud para mascotas.
          </p>
          <figure className="flex flex-col items-end gap-2 self-end">
            <figcaption className="text-right text-[12px] font-semibold leading-tight">
              Comercio participante
              <br />
              Escanea y verifica
            </figcaption>
            <div className="rounded-[14px] bg-white p-3 shadow-[0_2px_12px_rgba(1,86,89,.10)]">
              <Image
                src="/campanas/buen-fin-2026/qr-buen-fin-oficial.jpg"
                alt="Código QR oficial de El Buen Fin 2026 para verificar a Pata Amiga como comercio participante"
                width={132}
                height={132}
                unoptimized
              />
            </div>
          </figure>
        </section>
      </main>
    </div>
  );
}

function AvisoDeEstado({
  estado,
  sePuedeContratar,
}: {
  estado: EstadoCampana;
  sePuedeContratar: boolean;
}) {
  if (estado === "antes")
    return (
      <p className="rounded-[14px] bg-white px-4 py-3 text-[14.5px] font-semibold">
        Muy pronto: la promoción arranca el viernes 13 de noviembre.
      </p>
    );
  if (estado === "terminada")
    return (
      <div className="flex flex-col gap-3 rounded-[16px] bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[15px] font-semibold">
          La promoción de El Buen Fin terminó el 17 de noviembre.
        </p>
        <Link
          href="/registro"
          className="grid h-[48px] place-items-center rounded-full px-6 text-[15px] font-semibold text-white"
          style={{ background: C.petroleo }}
        >
          Contrata tu membresía
        </Link>
      </div>
    );
  if (!sePuedeContratar)
    return (
      <p className="rounded-[14px] bg-white px-4 py-3 text-[14.5px] font-semibold">
        La contratación no está disponible en este momento. Intenta más tarde.
      </p>
    );
  return null;
}

function Opcion(props: {
  letra: string;
  titulo: string;
  cifra: string;
  cifraNota: string;
  detalle: React.ReactNode;
  renglones: string[];
  boton: string;
  href: string;
  activo: boolean;
}) {
  return (
    <article className="flex flex-col gap-4 rounded-[22px] bg-white p-6 sm:p-7">
      <div className="flex items-center gap-3">
        <span
          className="font-display grid size-10 place-items-center rounded-full text-[20px] text-white"
          style={{ background: C.turquesa }}
          aria-hidden
        >
          {props.letra}
        </span>
        <h3 className="font-display text-[26px]">{props.titulo}</h3>
      </div>
      <div className="flex flex-col">
        <span className="font-display text-[56px] leading-none sm:text-[64px]">{props.cifra}</span>
        <span className="mt-1 text-[14px] font-semibold" style={{ color: C.turquesaClaro }}>
          {props.cifraNota}
        </span>
      </div>
      <p className="text-[15.5px]">{props.detalle}</p>
      <ul className="flex flex-col gap-2">
        {props.renglones.map((r) => (
          <li key={r} className="flex gap-2.5 text-[14px] leading-snug">
            <span aria-hidden className="font-bold" style={{ color: C.turquesa }}>
              ✓
            </span>
            {r}
          </li>
        ))}
      </ul>
      {props.activo ? (
        <Link
          href={props.href}
          className="mt-auto grid h-[52px] place-items-center rounded-full text-[16px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: C.petroleo }}
        >
          {props.boton}
        </Link>
      ) : (
        <span
          aria-disabled
          className="mt-auto grid h-[52px] place-items-center rounded-full border-2 text-[15px] font-semibold"
          style={{ borderColor: C.turquesaClaro, color: C.petroleo }}
        >
          Muy pronto
        </span>
      )}
    </article>
  );
}

function Paso({ n, texto, children }: { n: number; texto: string; children?: React.ReactNode }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-[16px] bg-white px-4 py-3.5">
      <span className="flex items-center gap-3">
        <span
          className="font-display grid size-9 flex-none place-items-center rounded-full text-[18px] text-white"
          style={{ background: C.turquesa }}
          aria-hidden
        >
          {n}
        </span>
        <span className="text-[15px] font-semibold leading-snug">{texto}</span>
      </span>
      {children}
    </li>
  );
}

function Rubro({ titulo, cifra, texto }: { titulo: string; cifra: string; texto: string }) {
  return (
    <div className="flex flex-col gap-1.5 rounded-[18px] bg-white p-5">
      <span className="text-[13px] font-semibold uppercase tracking-[.08em]" style={{ color: C.turquesaClaro }}>
        {titulo}
      </span>
      <span className="font-display text-[26px] leading-tight">{cifra}</span>
      <span className="text-[13.5px] leading-snug">{texto}</span>
    </div>
  );
}

function IconoCalendario() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

function preguntas(
  c: ReturnType<typeof cuentasBuenFin>,
  o: Oferta599 | null,
): [string, string][] {
  const $ = pesosDeOferta;
  return [
    [
      "¿El código sirve para mes a mes y para anual?",
      `Sí. ${BUEN_FIN.codigo} es un solo código: en mes a mes tu primer mes queda en ${$(c.primerMes)}; en anual pagas ${$(c.anualBuenFin)} por 12 meses.`,
    ],
    [
      "¿Cuánto pago después?",
      `Mes a mes: desde el segundo mes, ${$(c.mensual)} al mes por peludo. Anual: al cumplir el año se renueva al precio regular vigente (hoy ${$(c.anualRegular)} al año).`,
    ],
    [
      "¿El anual es más barato?",
      c.primerAnioMensual === c.anualBuenFin
        ? `En el primer año, no: las dos modalidades suman ${$(c.anualBuenFin)}. El anual te ahorra ${$(c.ahorroAnual)} frente a su precio regular de ${$(c.anualRegular)}. Elige la que te acomode.`
        : `Mes a mes, tu primer año suma ${$(c.primerAnioMensual)}; el anual cuesta ${$(c.anualBuenFin)} por 12 meses (${$(c.ahorroAnual)} menos que su precio regular de ${$(c.anualRegular)}). Elige la que te acomode.`,
    ],
    [
      "¿Cómo funcionan los meses sin intereses?",
      "Solo en la modalidad anual y con tarjetas de crédito participantes. Eliges 3 o 6 meses en la pantalla de pago, después de escribir tu tarjeta, según las condiciones de tu banco.",
    ],
    [
      "¿Desde cuándo puedo pedir un reintegro?",
      o
        ? `Después de los tiempos de espera, que cuentan desde que el comité aprueba a tu peludo: cuidados cotidianos desde el día ${o.cuidados.aperturaDia}, despedida desde el día ${o.despedida.aperturaDia} y emergencias graves desde el mes ${o.emergencia.aperturaMes}.`
        : "Después de los tiempos de espera, que cuentan desde que el comité aprueba a tu peludo. Los detalles están en el Reglamento de reintegros.",
    ],
    [
      "¿El código aplica a mi segundo peludo?",
      `${BUEN_FIN.codigo} aplica a la membresía de tu primer peludo. Cada peludo adicional ya tiene 15% de descuento.`,
    ],
    [
      "¿Hasta cuándo puedo usar el código?",
      "Del 13 al 17 de noviembre de 2026, hasta las 23:59 h del centro de México.",
    ],
    ...(o
      ? ([
          [
            "¿Y si la membresía no es lo que esperaba?",
            `Tienes ${o.garantiaDias} días de garantía de satisfacción: te devolvemos lo que pagaste por ese peludo, menos lo que ya se le haya reintegrado. En mes a mes cancelas cuando quieras.`,
          ],
        ] as [string, string][])
      : []),
  ];
}
