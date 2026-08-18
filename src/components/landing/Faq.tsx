"use client";

import { useState } from "react";

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

export function Faq() {
  const [open, setOpen] = useState<string | null>(FAQ[0].title);

  return (
    <div className="flex flex-col gap-3">
      {FAQ.map((cat) => {
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
