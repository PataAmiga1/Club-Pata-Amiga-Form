import { formatDateEs } from "@/lib/dates";
import { describirToque, leerAtribucionGuardada, mismoToque } from "@/lib/atribucion";

/**
 * «Origen»: de qué anuncio o campaña llegó el miembro, de solo lectura.
 * Sale de `profiles.attribution` (utm/fbclid capturados al crear la cuenta,
 * solo si aceptó cookies). Sin dato, lo dice — no se inventa un origen.
 */
export function OrigenDePauta({
  atribucion,
  className = "",
}: {
  atribucion: unknown;
  className?: string;
}) {
  const a = leerAtribucionGuardada(atribucion);
  if (!a)
    return (
      <span className={className}>
        <strong>Origen:</strong> sin datos de campaña
      </span>
    );
  const igual = mismoToque(a.primero, a.ultimo);
  return (
    <span className={`flex flex-col gap-0.5 ${className}`}>
      <span title={a.primero.pagina ? `Llegó a ${a.primero.pagina}` : undefined}>
        <strong>Origen:</strong> {describirToque(a.primero)} · {formatDateEs(a.primero.ts)}
      </span>
      {!igual && (
        <span title={a.ultimo.pagina ? `Llegó a ${a.ultimo.pagina}` : undefined}>
          <strong>Antes de registrarse:</strong> {describirToque(a.ultimo)} ·{" "}
          {formatDateEs(a.ultimo.ts)}
        </span>
      )}
    </span>
  );
}
