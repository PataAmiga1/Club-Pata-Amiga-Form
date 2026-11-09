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
import { fetchSiteAssets, fetchSiteSettings } from "@/lib/site";
import {
  BUEN_FIN,
  CIFRAS_DE_PAUTA,
  cuadraConLaPauta,
  cuentasBuenFin,
  enlaceDeRegistro,
  estadoDeLaCampana,
  vistaForzada,
  type CuentasBuenFin,
  type EstadoCampana,
} from "@/lib/campanas/buen-fin";
import { VistaBuenFin } from "./VistaBuenFin";
import { CuentaRegresiva } from "./CuentaRegresiva";

/**
 * EL ENLACE DE EL BUEN FIN 2026 (13–17 nov). Lo abren los anuncios, las
 * stories y WhatsApp. La persona elige mes a mes o anual y el botón la lleva al
 * registro con la modalidad y el código ya puestos (`enlaceDeRegistro`).
 *
 * Lenguaje visual: el de la campaña aprobada (story «¿Cómo contrato?»): crema,
 * verde petróleo, turquesa; Fraiche en titulares y cifras, Poppins en el
 * cuerpo. Superficies lisas crema/blanco: las fotos del sitio (`site_assets`,
 * las mismas que edita el equipo en Admin → Sitio web) y la tipografía cargan
 * la página. Se probó un patrón de mascotas en línea y Pablo lo descartó
 * (9-nov): «muy simple». Las dos opciones pesan lo mismo siempre.
 *
 * Insignia «El Buen Fin · MIPYMES»: archivo oficial, sacado sin alterar de la
 * «Guía de integración del código QR» de El Buen Fin 2026 que mandó el
 * cliente (ver docs/BUEN-FIN-2026.md). Va sobre blanco y con aire alrededor.
 *
 * Las cifras salen de la versión publicada del plan (lo que cobra el
 * checkout), nunca de la pauta. Si no cuadran con `CIFRAS_DE_PAUTA`, fuera de
 * producción aparece una franja que lo avisa.
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

const INSIGNIA = "/campanas/buen-fin-2026/buen-fin-2026-mipymes.png";

export const metadata: Metadata = {
  title: "El Buen Fin 2026 · Pata Amiga",
  // Sin cifras: los precios salen de la versión publicada; van en la página.
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
  const [oferta, abierto, ajustes, fotos] = await Promise.all([
    ALTAS_SON_599 ? ofertaPublica599(admin) : Promise.resolve(null),
    registroAbierto(),
    fetchSiteSettings().catch(() => ({}) as Record<string, string>),
    fetchSiteAssets().catch(() => ({}) as Record<string, string>),
  ]);
  // Fotos editables del sitio. Sin foto, el bloque no se pinta.
  // Hero: el slot propio de la campaña (persona con su peludo); mientras el
  // equipo no lo llene, la tutora con su bulldog de la portada.
  const fotoHero = fotos["buenfin-hero"] ?? fotos["landing-planes"] ?? null;
  // Segunda foto solo si el hero ya usa la de la campaña: no repetir la misma.
  const fotoPlanes = fotos["buenfin-hero"] ? (fotos["landing-planes"] ?? null) : null;
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
  const vende = estado === "activa" && sePuedeContratar;
  const $ = pesosDeOferta;
  const correoAyuda = ajustes.contact_email || "";

  const enlaceMensual = enlaceDeRegistro("mensual", busqueda);
  const enlaceAnual = enlaceDeRegistro("anual", busqueda);
  const avisoQA = qa || (!cuadra && (await fueraDeProduccion()));

  return (
    <div
      className={`${poppins.variable} flex min-h-dvh flex-col ${vende ? "pb-[88px] sm:pb-0" : ""}`}
      style={{
        backgroundColor: C.crema,
        color: C.petroleo,
        fontFamily: "var(--font-poppins), sans-serif",
      }}
    >
      <VistaBuenFin estado={estado} />

      {avisoQA && (
        <div className="bg-[#1e1e1e] px-4 py-2 text-center text-[12px] leading-snug text-white">
          Solo para el equipo · vista «{estado}».{" "}
          {principal ? "" : "Sin precio publicado del plan $599: se muestran las cifras de la pauta. "}
          {principal && !cuadra
            ? `⚠ Los precios publicados (${$(c.mensual)}/mes, ${$(c.anualRegular)}/año) no dan las cifras que debe decir la pauta (${$(CIFRAS_DE_PAUTA.mensualPesos)}/mes, ${$(CIFRAS_DE_PAUTA.anualRegularPesos)}/año → ${$(CIFRAS_DE_PAUTA.anualBuenFinPesos)}). `
            : ""}
          {!abierto ? "Registro cerrado en Ajustes del sitio. " : ""}
        </div>
      )}

      {/* Encabezado */}
      <header className="mx-auto flex w-full max-w-[1080px] items-center justify-between px-4 pt-4 sm:px-6 sm:pt-6">
        <Link href="/" aria-label="Pata Amiga — inicio">
          <Image src="/brand/logo-light-bg.svg" alt="Pata Amiga" width={112} height={38} priority />
        </Link>
        <span className="rounded-full bg-white px-3 py-1.5 text-[12px] font-semibold">
          Código <strong className="tracking-[.08em]">{BUEN_FIN.codigo}</strong>
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-[1080px] flex-col gap-12 px-4 pb-14 pt-5 sm:gap-16 sm:px-6 sm:pt-10">
        {/* ============ Hero ============ */}
        <section className="grid grid-cols-1 items-center gap-6 md:grid-cols-[1.15fr_1fr] md:gap-10">
          <div className="flex flex-col gap-4 sm:gap-5">
            <p className="text-[12px] font-semibold uppercase tracking-[.14em]" style={{ color: C.turquesa }}>
              El Buen Fin 2026 · {BUEN_FIN.fechasEnTexto}
            </p>
            <h1 className="font-display text-[44px] leading-[.98] sm:text-[72px]">
              La cuenta de Pata&nbsp;Amiga
            </h1>
            <p className="font-display text-[21px] leading-tight sm:text-[30px]" style={{ color: C.turquesa }}>
              {BUEN_FIN.mensaje}
            </p>

            {estado !== "terminada" && (
              <>
                {/* Las dos ofertas, mismo tamaño, arriba del pliegue en móvil */}
                <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
                  <OfertaCorta
                    titulo="Mes a mes"
                    cifra={$(c.primerMes)}
                    nota="tu primer mes"
                    despues={`luego ${$(c.mensual)}/mes`}
                  />
                  <OfertaCorta
                    titulo="Anual"
                    cifra={$(c.anualBuenFin)}
                    nota="12 meses"
                    despues={
                      <>
                        antes <s>{$(c.anualRegular)}</s>
                      </>
                    }
                  />
                </div>
                <a
                  href="#opciones"
                  className="grid h-[54px] place-items-center rounded-full text-[17px] font-semibold text-white shadow-[0_6px_18px_rgba(1,86,89,.25)] transition-opacity hover:opacity-90"
                  style={{ background: C.petroleo }}
                >
                  Elige cómo pagar ↓
                </a>
              </>
            )}
            <LineaDeEstado estado={estado} sePuedeContratar={sePuedeContratar} />
          </div>

          {/* Foto a un lado, contenido al otro (Pablo, 9-nov: nunca texto
              encima de una foto). En móvil va DEBAJO del texto, como bloque
              limpio: arriba del pliegue mandan las dos ofertas y el botón. */}
          {fotoHero && (
            <div className="relative aspect-square w-full overflow-hidden rounded-[28px] md:aspect-[5/6]">
              <Image
                src={fotoHero}
                alt="Una tutora abraza a su peludo"
                fill
                sizes="(min-width: 768px) 460px, 100vw"
                className="object-cover object-center"
                priority
              />
            </div>
          )}
        </section>

        {/* ============ Insignia oficial + lo que siempre tienes ============ */}
        <section
          aria-label="El Buen Fin 2026 y lo que siempre tienes"
          className="grid grid-cols-1 items-center gap-6 rounded-[24px] bg-white p-5 sm:p-7 md:grid-cols-[auto_1fr] md:gap-10"
        >
          {/* Sobre blanco y con aire: la guía de El Buen Fin pide no
              alterarla ni amontonarle cosas encima. */}
          <figure className="flex flex-col items-center gap-2 px-4 py-2">
            <Image
              src={INSIGNIA}
              alt="El Buen Fin 2026 · MIPYMES · 13 al 17 de noviembre"
              width={720}
              height={695}
              className="h-auto w-[220px] sm:w-[240px]"
            />
            <figcaption className="text-center text-[12.5px] font-semibold">
              Pata Amiga participa en El Buen Fin 2026
            </figcaption>
          </figure>
          <ul className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
            {MEMBERSHIP_FEATURES_599.map((f, i) => (
              <li key={f} className="flex items-center gap-3 text-[14px] font-semibold leading-tight">
                <span
                  className="grid size-9 flex-none place-items-center rounded-full"
                  style={{ background: "#E6F6F4", color: C.petroleo }}
                  aria-hidden
                >
                  {ICONOS[i]}
                </span>
                {f === "Disponible en todo México" ? "Alcance en todo México" : f}
              </li>
            ))}
          </ul>
        </section>

        {/* ============ Las dos opciones ============ */}
        {estado !== "terminada" && (
          <section id="opciones" aria-labelledby="opciones-t" className="flex scroll-mt-4 flex-col gap-5">
            <Titulo id="opciones-t">Elige cómo pagar</Titulo>
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Opcion
                letra="A"
                titulo="Mes a mes"
                cifra={$(c.primerMes)}
                cifraNota="tu primer mes con BUENFIN"
                hoy={$(c.primerMes)}
                despues={`${$(c.mensual)} al mes`}
                despuesNota="desde el 2.º mes"
                renglones={[
                  "Una mascota · IVA incluido",
                  "Tarjeta de débito o crédito",
                  "Sin plazo forzoso: cancelas cuando quieras",
                ]}
                boton="Elegir mes a mes"
                href={enlaceMensual}
                activo={vende}
              />
              <Opcion
                letra="B"
                titulo="Anual"
                cifra={$(c.anualBuenFin)}
                cifraNota={
                  <>
                    12 meses con BUENFIN · antes <s>{$(c.anualRegular)}</s>, ahorras {$(c.ahorroAnual)}
                  </>
                }
                hoy={$(c.anualBuenFin)}
                despues={`${$(c.anualRegular)} al año`}
                despuesNota="al renovar, precio regular vigente"
                renglones={[
                  "Una mascota · IVA incluido",
                  "Una sola exhibición con débito o crédito",
                  "O 3 o 6 meses sin intereses con tarjetas de crédito participantes, según las condiciones de tu tarjeta",
                ]}
                boton="Elegir anual"
                href={enlaceAnual}
                activo={vende}
              />
            </div>
          </section>
        )}

        {/* ============ Haz la cuenta: totales reales del primer año ============ */}
        {estado !== "terminada" && (
          <section aria-labelledby="cuenta-t" className="flex flex-col gap-4">
            <Titulo id="cuenta-t">Haz la cuenta del primer año</Titulo>
            <div className={fotoPlanes ? "grid grid-cols-1 items-center gap-5 md:grid-cols-2" : ""}>
            {fotoPlanes && (
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[24px]">
                <Image
                  src={fotoPlanes}
                  alt="Una tutora abraza a su bulldog francés"
                  fill
                  sizes="(min-width: 768px) 500px, 100vw"
                  className="object-cover object-[50%_30%]"
                />
              </div>
            )}
            <div className="flex flex-col gap-3">
            <div className={`grid grid-cols-1 gap-3 ${fotoPlanes ? "" : "sm:grid-cols-2"}`}>
              <Total
                etiqueta="Mes a mes"
                operacion={`${$(c.primerMes)} + 11 × ${$(c.mensual)}`}
                total={$(c.primerAnioMensual)}
              />
              <Total etiqueta="Anual" operacion="12 meses, un pago o 3/6 MSI" total={$(c.anualBuenFin)} />
            </div>
            <p className="text-[14px] leading-relaxed">
              Es la misma membresía. Mes a mes pagas poco a poco y cancelas cuando
              quieras; en anual pagas el año de una vez.
            </p>
            </div>
            </div>
          </section>
        )}

        {/* ============ Cómo contratar — espejo de la story ============ */}
        {estado !== "terminada" && (
          <section aria-labelledby="como-t" className="flex flex-col gap-4">
            <Titulo id="como-t">¿Cómo contrato?</Titulo>
            <ol className="flex max-w-[640px] flex-col gap-3">
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
            <p className="text-[13.5px] leading-relaxed">
              Desde esta página el código ya va puesto. Antes, creas tu cuenta y
              registras a tu peludo: son unos minutos.
            </p>
          </section>
        )}

        {/* ============ Qué incluye ============ */}
        <section aria-labelledby="incluye-t" className="flex flex-col gap-4">
          <Titulo id="incluye-t">Qué incluye</Titulo>
          {principal ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <Rubro
                  titulo="Emergencias graves"
                  cifra={`${$(principal.emergencia.inicial)} → ${$(principal.emergencia.tope)}`}
                  texto={`Al año. Desde el mes ${principal.emergencia.aperturaMes}; crece cada mes pagado. Hospital, cirugía, estudios y medicinas.`}
                />
                <Rubro
                  titulo="Cuidados cotidianos"
                  cifra={`${$(principal.cuidados.inicial)} → ${$(principal.cuidados.tope)}`}
                  texto={`Al año. Desde el día ${principal.cuidados.aperturaDia}; crece cada mes pagado. Consultas, vacunas, desparasitación y dental.`}
                />
                <Rubro
                  titulo="Despedida"
                  cifra={$(principal.despedida.monto)}
                  texto={`Al año. Desde el día ${principal.despedida.aperturaDia}.`}
                />
              </div>
              <ul className="flex flex-col gap-2 rounded-[18px] bg-white p-5 text-[14px] leading-snug">
                <Check>
                  <strong>Tiempos de espera:</strong> cuentan desde que el comité
                  aprueba a tu peludo. La orientación veterinaria 24/7 es desde el
                  primer día.
                </Check>
                <Check>Montos por peludo y por año; se renuevan y no se acumulan.</Check>
                <Check>Reintegro en máximo {principal.diasHabiles} días hábiles.</Check>
                <Check>Sin copago: no pagas nada extra al usar tu beneficio.</Check>
                <Check>
                  Sin límite de edad. Desde los 8 años se pide un certificado
                  veterinario.
                </Check>
              </ul>
            </>
          ) : (
            <p className="rounded-[18px] bg-white p-5 text-[14.5px] leading-relaxed">
              Reintegros para emergencias graves, cuidados cotidianos y despedida,
              con el veterinario que tú elijas. Montos y tiempos de espera en el
              Reglamento de reintegros.
            </p>
          )}
        </section>

        {/* ============ Preguntas ============ */}
        <section aria-labelledby="preguntas-t" className="flex flex-col gap-3">
          <Titulo id="preguntas-t">Preguntas frecuentes</Titulo>
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
          {correoAyuda && (
            <p className="text-[14px]">
              ¿Otra duda? Escríbenos a{" "}
              <a href={`mailto:${correoAyuda}?subject=El%20Buen%20Fin`} className="font-semibold underline">
                {correoAyuda}
              </a>
              .
            </p>
          )}
        </section>

        {/* ============ QR oficial + legales ============ */}
        <section className="flex flex-col-reverse gap-6 rounded-[20px] p-5 sm:flex-row sm:items-end sm:justify-between" style={{ background: C.crema }}>
          <p className="max-w-[640px] text-[12px] leading-relaxed">
            Promoción válida del 13 al 17 de noviembre de 2026, hasta las 23:59 h
            del centro de México, con el código {BUEN_FIN.codigo}, en la membresía
            del primer peludo de la cuenta. Mes a mes: el primer mes cuesta{" "}
            {$(c.primerMes)} y desde el segundo, {$(c.mensual)} al mes por peludo.
            Anual: {$(c.anualBuenFin)} por 12 meses (precio regular{" "}
            {$(c.anualRegular)}); al renovar aplica el precio regular vigente.
            Precios en pesos mexicanos, IVA incluido. Meses sin intereses solo en
            anual, con tarjetas de crédito participantes y según las condiciones de
            tu banco. No acumulable con otros códigos de promoción. Los reintegros
            aplican después de los tiempos de espera y conforme al{" "}
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

      {/* ============ Barra fija en móvil, solo mientras se vende ============ */}
      {vende && (
        <nav
          aria-label="Contratar"
          className="fixed inset-x-0 bottom-0 z-40 border-t bg-white px-3 pb-[calc(env(safe-area-inset-bottom)+10px)] pt-2 shadow-[0_-6px_20px_rgba(1,86,89,.10)] sm:hidden"
          style={{ borderColor: "#E4DFD3" }}
        >
          <p className="pb-1.5 text-center text-[11.5px]">
            <CuentaRegresiva compacta />
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Link
              href={enlaceMensual}
              className="grid h-[46px] place-items-center rounded-full text-[14px] font-semibold text-white"
              style={{ background: C.petroleo }}
            >
              Mes a mes · {$(c.primerMes)}
            </Link>
            <Link
              href={enlaceAnual}
              className="grid h-[46px] place-items-center rounded-full text-[14px] font-semibold text-white"
              style={{ background: C.petroleo }}
            >
              Anual · {$(c.anualBuenFin)}
            </Link>
          </div>
        </nav>
      )}
    </div>
  );
}

/* --------------------------------------------------------------- piezas --- */

function Titulo({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="font-display text-[30px] leading-tight sm:text-[40px]">
      {children}
    </h2>
  );
}

function LineaDeEstado({
  estado,
  sePuedeContratar,
}: {
  estado: EstadoCampana;
  sePuedeContratar: boolean;
}) {
  const caja = "rounded-[14px] bg-white px-4 py-3 text-[14px] font-semibold";
  if (estado === "antes")
    return <p className={caja}>Muy pronto: arranca el viernes 13 de noviembre.</p>;
  if (estado === "terminada")
    return (
      <div className="flex flex-col gap-3 rounded-[16px] bg-white px-5 py-4">
        <p className="text-[15px] font-semibold">
          La promoción de El Buen Fin terminó el 17 de noviembre.
        </p>
        <Link
          href="/registro"
          className="grid h-[50px] place-items-center rounded-full px-6 text-[15px] font-semibold text-white"
          style={{ background: C.petroleo }}
        >
          Contrata tu membresía
        </Link>
      </div>
    );
  if (!sePuedeContratar)
    return <p className={caja}>La contratación no está disponible en este momento.</p>;
  return (
    <p className="flex items-center gap-2 text-[14px]">
      <IconoReloj />
      <CuentaRegresiva />
    </p>
  );
}

function OfertaCorta(props: {
  titulo: string;
  cifra: string;
  nota: string;
  despues: React.ReactNode;
}) {
  return (
    <div className="flex flex-col rounded-[18px] bg-white px-3.5 py-3 sm:px-5 sm:py-4">
      <span className="text-[12px] font-semibold uppercase tracking-[.08em]" style={{ color: C.turquesaClaro }}>
        {props.titulo}
      </span>
      <span className="font-display text-[34px] leading-none sm:text-[48px]">{props.cifra}</span>
      <span className="mt-1 text-[12.5px] font-semibold leading-tight">{props.nota}</span>
      <span className="text-[12px] leading-tight opacity-80">{props.despues}</span>
    </div>
  );
}

function Opcion(props: {
  letra: string;
  titulo: string;
  cifra: string;
  cifraNota: React.ReactNode;
  hoy: string;
  despues: string;
  despuesNota: string;
  renglones: string[];
  boton: string;
  href: string;
  activo: boolean;
}) {
  return (
    <article className="flex flex-col gap-4 rounded-[22px] bg-white p-6 shadow-[0_2px_14px_rgba(1,86,89,.06)] sm:p-7">
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
        <span className="mt-1.5 text-[13.5px] font-semibold">{props.cifraNota}</span>
      </div>
      {/* Lo que pagas hoy y después, sin letra chica */}
      <dl className="grid grid-cols-2 overflow-hidden rounded-[14px] text-[13px]" style={{ background: "#F4F9F8" }}>
        <div className="flex flex-col gap-0.5 px-4 py-3">
          <dt className="font-semibold opacity-75">Hoy pagas</dt>
          <dd className="font-display text-[22px] leading-tight">{props.hoy}</dd>
        </div>
        <div className="flex flex-col gap-0.5 border-l px-4 py-3" style={{ borderColor: "#DCEDEA" }}>
          <dt className="font-semibold opacity-75">Después</dt>
          <dd className="font-display text-[22px] leading-tight">{props.despues}</dd>
          <dd className="text-[11.5px] leading-tight opacity-75">{props.despuesNota}</dd>
        </div>
      </dl>
      <ul className="flex flex-col gap-2">
        {props.renglones.map((r) => (
          <Check key={r}>{r}</Check>
        ))}
      </ul>
      {props.activo ? (
        <Link
          href={props.href}
          className="mt-auto grid h-[54px] place-items-center rounded-full text-[16px] font-semibold text-white transition-opacity hover:opacity-90"
          style={{ background: C.petroleo }}
        >
          {props.boton}
        </Link>
      ) : (
        <span
          aria-disabled
          className="mt-auto grid h-[54px] place-items-center rounded-full border-2 text-[15px] font-semibold"
          style={{ borderColor: C.turquesaClaro }}
        >
          Muy pronto
        </span>
      )}
    </article>
  );
}

function Total({ etiqueta, operacion, total }: { etiqueta: string; operacion: string; total: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] bg-white px-5 py-4">
      <div className="flex flex-col">
        <span className="text-[13px] font-semibold uppercase tracking-[.08em]" style={{ color: C.turquesaClaro }}>
          {etiqueta}
        </span>
        <span className="text-[13.5px]">{operacion}</span>
      </div>
      <span className="font-display text-[30px] leading-none">{total}</span>
    </div>
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
      <span className="font-display text-[24px] leading-tight">{cifra}</span>
      <span className="text-[13.5px] leading-snug">{texto}</span>
    </div>
  );
}

function Check({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5 text-[14px] leading-snug">
      <span aria-hidden className="font-bold" style={{ color: C.turquesa }}>
        ✓
      </span>
      <span>{children}</span>
    </li>
  );
}

/* Iconos de línea para las 5 características, en el mismo orden. */
const svg = (d: React.ReactNode) => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d}
  </svg>
);
const ICONOS = [
  // todo México: pin
  svg(<><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>),
  // tu veterinario: estetoscopio
  svg(<><path d="M6 3v6a5 5 0 0 0 10 0V3" /><path d="M11 14v2a4 4 0 0 0 8 0v-2" /><circle cx="19" cy="12" r="2" /></>),
  // segunda mascota: porcentaje
  svg(<><path d="M19 5 5 19" /><circle cx="7" cy="7" r="2.5" /><circle cx="17" cy="17" r="2.5" /></>),
  // orientación 24/7: globo de chat
  svg(<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />),
  // 100% digital: teléfono
  svg(<><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18h2" /></>),
];

function IconoReloj() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function preguntas(c: CuentasBuenFin, o: Oferta599 | null): [string, string][] {
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
      "¿Cuánto pago en el primer año?",
      `Mes a mes: ${$(c.primerMes)} + 11 × ${$(c.mensual)} = ${$(c.primerAnioMensual)}. Anual: ${$(c.anualBuenFin)} por 12 meses (${$(c.ahorroAnual)} menos que su precio regular de ${$(c.anualRegular)}).`,
    ],
    [
      "¿Cómo funcionan los meses sin intereses?",
      "Solo en anual y con tarjetas de crédito participantes. Eliges 3 o 6 meses en la pantalla de pago, después de escribir tu tarjeta, según las condiciones de tu banco.",
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
