import Link from "next/link";
import { ExportBuilder } from "./ExportBuilder";

export const metadata = { title: "Exportar datos · Panel del comité" };

export default function ExportarPage() {
  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-col gap-1">
        <Link
          href="/admin/finanzas"
          className="text-sm font-semibold text-teal-deep"
        >
          ← Finanzas
        </Link>
        <h1 className="font-display text-[26px] text-ink-title">
          Exportar datos
        </h1>
        <p className="max-w-[720px] text-[13.5px] leading-relaxed text-ink-secondary">
          Arma el archivo que necesitas: elige qué quieres bajar, tica las
          columnas y descárgalo en CSV. Se abre en Excel o en Google Sheets.
        </p>
      </div>
      <ExportBuilder />
    </div>
  );
}
