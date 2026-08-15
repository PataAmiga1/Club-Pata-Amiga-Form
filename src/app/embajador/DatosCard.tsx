import { formatDateEs } from "@/lib/dates";

/**
 * Los datos que el embajador capturó al aplicar (equipo, 15-ago).
 *
 * "Mi cuenta" mostraba banco, INE y redes, pero no lo más básico: cómo se
 * llama, con qué correo entró, qué teléfono dejó. Quien quería confirmar si su
 * CURP quedó bien escrita no tenía dónde verla — y esos datos ya no se vuelven
 * a pedir en ningún lado, así que sencillamente desaparecían tras el registro.
 *
 * Es solo lectura a propósito: nombre, CURP y domicilio son lo que el comité
 * ya validó contra su INE. Corregirlos por cuenta propia dejaría el expediente
 * diciendo una cosa y la identificación otra, así que se pide por soporte.
 */
export function DatosCard({
  datos,
}: {
  datos: {
    first_name: string;
    last_name: string | null;
    second_last_name: string | null;
    email: string | null;
    phone: string | null;
    curp: string | null;
    birth_date: string | null;
    postal_code: string | null;
    colony: string | null;
    city: string | null;
    state: string | null;
  };
}) {
  const nombre = [datos.first_name, datos.last_name, datos.second_last_name]
    .filter(Boolean)
    .join(" ");
  const domicilio =
    [datos.colony, datos.city, datos.state, datos.postal_code ? `CP ${datos.postal_code}` : null]
      .filter(Boolean)
      .join(", ") || null;

  const filas: { etiqueta: string; valor: string | null }[] = [
    { etiqueta: "Nombre completo", valor: nombre || null },
    { etiqueta: "Correo", valor: datos.email },
    { etiqueta: "Teléfono", valor: datos.phone },
    { etiqueta: "CURP", valor: datos.curp },
    {
      etiqueta: "Fecha de nacimiento",
      valor: datos.birth_date
        ? formatDateEs(new Date(`${datos.birth_date}T12:00:00`))
        : null,
    },
    { etiqueta: "Dirección", valor: domicilio },
  ];

  return (
    <div className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)]">
      <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
        TUS DATOS
      </span>
      <dl className="flex flex-col">
        {filas.map((f) => (
          <div
            key={f.etiqueta}
            className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-b border-[#F2EEE4] py-2 last:border-0"
          >
            <dt className="text-[11px] font-extrabold tracking-[.05em] text-ink-tertiary">
              {f.etiqueta.toUpperCase()}
            </dt>
            <dd
              className={`min-w-0 text-[13.5px] ${f.valor ? "text-ink-body" : "text-ink-placeholder"}`}
            >
              {f.valor ?? "— sin registrar"}
            </dd>
          </div>
        ))}
      </dl>
      <span className="text-[11.5px] leading-relaxed text-ink-tertiary">
        Son los datos con los que el comité validó tu identidad. Si algo está
        mal, escríbenos a soporte@pataamiga.mx y lo corregimos.
      </span>
    </div>
  );
}
