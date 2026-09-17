"use client";

import { useState } from "react";
import type { OfertaPublica599 } from "@/lib/plans/oferta";
import { pesosDeOferta } from "@/lib/plans/oferta-texto";

/**
 * Preguntas frecuentes (contenido del sitio actual pataamiga.mx, adaptado a
 * la terminología vinculante 2026: reintegro, orientación — nunca fondo
 * solidario, respaldo/apoyo económico ni consulta profesional).
 */
type QA = { q: string; a: string[] };
type Category = { title: string; items: QA[] };

const FAQ: Category[] = [
  {
    title: "Sobre Pata Amiga",
    items: [
      {
        q: "¿Qué es Pata Amiga?",
        a: [
          "Pata Amiga es una membresía de salud para peludos creada para que nunca tengas que enfrentar solo los imprevistos con tu peludo.",
          "Somos una comunidad de personas que comparten el mismo propósito: cuidar a quienes nos acompañan con amor todos los días. Por eso, cuando formas parte de la manada, cuentas con beneficios que te ayudan a cuidar su salud y a tener mayor tranquilidad.",
          "Con una sola membresía puedes proteger hasta 3 peludos y disfrutar de beneficios como:\n• Reintegro en emergencias médicas, para ayudarte con gastos por urgencias, estudios, cirugía u hospitalización.\n• Reintegro para vacunas, para impulsar el cuidado preventivo de tu peludo.\n• Reintegro para momentos de despedida, para ayudarte con los gastos en uno de los momentos más difíciles.\n• Orientación veterinaria 24/7, para resolver dudas y recibir guía cuando la necesites, estés donde estés.",
          "Además, tu membresía tiene alcance en todo México, es 100% digital y tú decides con qué veterinario atender a tu peludo.",
          "Porque cuando cuidamos juntos, todo se vuelve un poco más fácil.",
        ],
      },
    ],
  },
  {
    title: "Sobre membresía y contribuciones",
    items: [
      {
        q: "¿Cuántas membresías existen?",
        a: [
          "En Pata Amiga solo existe una membresía, diseñada para hacer más fácil el cuidado de tus peludos.",
          "Puedes elegir la modalidad que mejor se adapte a ti:\n• Mensual: desde $159 al mes.\n• Anual: realiza un solo pago y disfruta de todos los beneficios durante 12 meses.",
          "Sin importar la modalidad que elijas, tendrás acceso a los mismos beneficios y podrás proteger hasta 3 peludos con una sola membresía.",
        ],
      },
      {
        q: "¿Cuánto dura la membresía?",
        a: [
          "Tú decides cómo disfrutar de tu membresía: puedes contratarla en modalidad mensual o anual.",
          "Ambas opciones cuentan con renovación automática, para que tus peludos continúen protegidos y sigan disfrutando de todos los beneficios de Pata Amiga sin interrupciones.",
          "Si en algún momento deseas cancelar tu renovación, puedes hacerlo de acuerdo con los términos de tu membresía.",
        ],
      },
      {
        q: "¿Qué formas de pago aceptan?",
        a: [
          "Actualmente puedes adquirir tu membresía con tarjetas de crédito y débito.",
          "Estamos trabajando para incorporar nuevas formas de pago muy pronto, para que unirte a la manada y proteger a tus peludos sea cada vez más fácil.",
        ],
      },
    ],
  },
  {
    title: "Lo que incluye tu membresía",
    items: [
      {
        q: "¿Con qué cuento al ser parte de la manada?",
        a: [
          "Al formar parte de Pata Amiga, tú y hasta 3 peludos podrán disfrutar de beneficios pensados para acompañarlos en cada etapa de su vida.",
          "Reintegro en emergencias médicas: recibe un reintegro para ayudarte con gastos por urgencias, estudios, cirugía u hospitalización cuando tu peludo más lo necesite.",
          "Reintegro para vacunas: porque la prevención también es una forma de cuidar. Tu membresía incluye un reintegro para apoyar el esquema de vacunación de tus peludos.",
          "Reintegro para momentos de despedida: en uno de los momentos más difíciles, cuentas con un reintegro para ayudarte con los gastos derivados de la despedida de tu compañero.",
          "Orientación veterinaria 24/7: resuelve tus dudas y recibe orientación en cualquier momento, desde donde estés, para tomar las mejores decisiones sobre la salud de tu peludo.",
          "Ayudamos a más peludos juntos: por cada 1,000 nuevos miembros, realizamos una donación a refugios aliados para que más peludos tengan una nueva oportunidad. Porque en Pata Amiga no solo cuidas a tus peludos; también formas parte de una comunidad que ayuda a muchas más.",
        ],
      },
    ],
  },
  {
    title: "Sobre embajadores",
    items: [
      {
        q: "¿Quiénes son los embajadores?",
        a: [
          "Los embajadores de Pata Amiga son personas, creadores de contenido, médicos veterinarios, asociaciones y refugios aliados que comparten nuestra misión de promover el bienestar animal.",
          "A través de sus redes, comunidades y espacios, nos ayudan a que más familias conozcan Pata Amiga y puedan proteger a sus peludos. Como parte de este programa, reciben beneficios especiales por impulsar el crecimiento de nuestra comunidad y contribuir a que cada vez más peludos tengan acceso a una mejor calidad de vida.",
        ],
      },
    ],
  },
  {
    title: "Sobre la red veterinaria y de cuidado",
    items: [
      {
        q: "¿Quiénes pueden ser parte de nuestra red de aliados?",
        a: [
          "Nuestra red de aliados está abierta a hospitales veterinarios, clínicas, médicos veterinarios, laboratorios, estéticas caninas y felinas, paseadores, etólogos, entrenadores, hospedajes para peludos, centros funerarios y, en general, a todos los profesionales y negocios dedicados al bienestar animal que compartan nuestra misión.",
          "Si tu trabajo ayuda a mejorar la vida de los perros y gatos, en Pata Amiga siempre habrá un lugar para sumar esfuerzos y seguir cuidando a más peludos juntos.",
        ],
      },
    ],
  },
];

/**
 * Con el registro cerrado (17-sep-2026) la respuesta de precios no puede
 * ofrecer el $159, que ya no se vende. El resto describe beneficios que siguen
 * siendo ciertos para quien ya es miembro.
 */
const PRECIOS_CON_REGISTRO_CERRADO = [
  "Estamos preparando la nueva membresía Pata Amiga. Por ahora el registro está cerrado: déjanos tus datos y te avisamos en cuanto abra.",
  "Si ya eres miembro, tu membresía sigue igual, con todos sus beneficios.",
];

/**
 * Las respuestas que cambian con la membresía $599 (sección 7, 17-sep-2026).
 * Los números salen de la versión publicada, no se escriben aquí: si el equipo
 * publica una versión nueva, la portada la sigue sola. Lo que no está aquí
 * (formas de pago, embajadores, red de aliados) es igual en los dos productos.
 */
function respuestas599(o: OfertaPublica599): Record<string, string[]> {
  const p = o.principal;
  const a = o.adicional;
  const $ = pesosDeOferta;
  return {
    "¿Qué es Pata Amiga?": [
      FAQ[0].items[0].a[0],
      FAQ[0].items[0].a[1],
      `Cada peludo tiene su propia membresía, y del segundo en adelante tienes 15% de descuento. Sus beneficios:\n• Cuidados cotidianos: reintegro para consultas y cuidados del día a día incluidos en nuestro catálogo.\n• Emergencia veterinaria: reintegro para urgencias, estudios, cirugía u hospitalización cuando tu peludo más lo necesite.\n• Despedida: reintegro para ayudarte con los gastos en uno de los momentos más difíciles.\n• Orientación veterinaria 24/7, para resolver dudas y recibir guía cuando la necesites, estés donde estés.`,
      FAQ[0].items[0].a[3],
      FAQ[0].items[0].a[4],
    ],
    "¿Cuántas membresías existen?": [
      "En Pata Amiga cada peludo tiene su propia membresía, con sus propios montos disponibles.",
      `Puedes elegir la modalidad que mejor se adapte a ti:\n• Mensual: ${$(p.mensualPesos)} al mes por peludo.\n• Anual: ${$(p.anualPesos)} en un solo pago, y te ahorras ${$(p.ahorroAnualPesos)}.`,
      `Del segundo peludo en adelante, sin límite, tienes 15% de descuento: ${$(a.mensualPesos)} al mes o ${$(a.anualPesos)} al año.`,
      "No hay plazo forzoso: cancelas cuando quieras.",
    ],
    "¿Con qué cuento al ser parte de la manada?": [
      "Cada peludo cuenta con montos disponibles que crecen mientras sigue en la manada. Se renuevan cada año desde el día en que entró; lo que no se usa no se acumula.",
      `Cuidados cotidianos: desde el día ${p.cuidados.aperturaDia}, con ${$(p.cuidados.inicial)}. Suben ${$(p.cuidados.incremento)} por cada mes pagado, hasta ${$(p.cuidados.tope)} al año. Aplican para lo que está en nuestro catálogo de cuidados, que puedes ver antes de pagar.`,
      `Emergencia veterinaria: desde el mes ${p.emergencia.aperturaMes}, con ${$(p.emergencia.inicial)}. Suben ${$(p.emergencia.incremento)} por cada mes pagado, hasta ${$(p.emergencia.tope)} al año.`,
      `Despedida: ${$(p.despedida.monto)} desde el día ${p.despedida.aperturaDia}, para ayudarte con los gastos de la despedida de tu compañero.`,
      "Los días y los meses se cuentan desde que nuestro comité aprueba el perfil de tu peludo.",
      `Te reintegramos en máximo ${p.diasHabiles} días hábiles. Si nos tardamos más, ese mes de tu peludo es gratis.`,
      "Orientación veterinaria 24/7: resuelve tus dudas y recibe orientación en cualquier momento, desde donde estés, para tomar las mejores decisiones sobre la salud de tu peludo.",
      FAQ[2].items[0].a[5],
    ],
    "¿Hay límite de edad para mi peludo?": [
      "No. Recibimos peludos de cualquier edad. Si tu peludo tiene 8 años o más, te pedimos un certificado médico de su veterinario al registrarlo.",
    ],
    "¿Y si la membresía no es lo que esperaba?": [
      `Tienes una garantía de satisfacción: durante los primeros ${p.garantiaDias} días te devolvemos lo que pagaste por ese peludo, menos lo que ya se te haya reintegrado. La pides desde tu cuenta.`,
    ],
  };
}

/** Preguntas que solo existen en el $599; van después de la respuesta indicada. */
const NUEVAS_599: Record<string, string[]> = {
  "¿Con qué cuento al ser parte de la manada?": [
    "¿Hay límite de edad para mi peludo?",
    "¿Y si la membresía no es lo que esperaba?",
  ],
};

export function Faq({
  registroAbierto = true,
  oferta599 = null,
}: {
  registroAbierto?: boolean;
  /** Oferta publicada del $599 cuando es lo que se vende (`ALTAS_SON_599`). */
  oferta599?: OfertaPublica599 | null;
}) {
  const [open, setOpen] = useState<string | null>(FAQ[0].title);
  const nuevas = registroAbierto && oferta599 ? respuestas599(oferta599) : null;
  const faq = nuevas
    ? FAQ.map((cat) => ({
        ...cat,
        items: cat.items.flatMap((item) => [
          { ...item, a: nuevas[item.q] ?? item.a },
          ...(NUEVAS_599[item.q] ?? []).map((q) => ({ q, a: nuevas[q] })),
        ]),
      }))
    : registroAbierto
    ? FAQ
    : FAQ.map((cat) => ({
        ...cat,
        items: cat.items.map((item) =>
          item.q === "¿Cuántas membresías existen?"
            ? { ...item, a: PRECIOS_CON_REGISTRO_CERRADO }
            : item,
        ),
      }));

  return (
    <div className="flex flex-col gap-3">
      {faq.map((cat) => {
        const isOpen = open === cat.title;
        return (
          <div
            key={cat.title}
            className={`overflow-hidden rounded-[18px] bg-white transition-shadow ${
              isOpen
                ? "shadow-[0_6px_20px_rgba(30,83,80,.10)]"
                : "shadow-[0_2px_12px_rgba(30,83,80,.06)] hover:shadow-[0_6px_20px_rgba(30,83,80,.12)]"
            }`}
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : cat.title)}
              aria-expanded={isOpen}
              className="group flex w-full items-center justify-between px-6 py-5 text-left transition-colors hover:bg-cream-light"
            >
              <span className="font-display text-[19px] text-ink-title transition-colors group-hover:text-teal-deep">
                {cat.title}
              </span>
              <span
                aria-hidden
                className={`text-teal-deep transition-transform group-hover:translate-y-0.5 ${isOpen ? "rotate-180" : ""}`}
              >
                ▾
              </span>
            </button>
            {isOpen && (
              <div className="flex flex-col gap-5 px-6 pb-6">
                {cat.items.map((item) => (
                  <div key={item.q} className="flex flex-col gap-2.5">
                    <h3 className="text-[15px] font-bold text-ink-title">
                      {item.q}
                    </h3>
                    {item.a.map((p, i) => (
                      <p
                        key={i}
                        className="whitespace-pre-line text-sm leading-relaxed text-ink-body"
                      >
                        {p}
                      </p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
