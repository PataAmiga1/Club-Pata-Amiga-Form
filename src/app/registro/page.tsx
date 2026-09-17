import { ALTAS_SON_599 } from "@/lib/plans/planes";
import { RegistroCliente } from "./RegistroCliente";

/**
 * Alta de cuenta. La pantalla es de cliente; esta envoltura existe para leer
 * en el servidor qué plan se vende hoy (`PLAN_DE_ALTAS` no llega al navegador)
 * y que la banda de características diga la tercera correcta (sección 7).
 */
export default function RegistroPage() {
  return <RegistroCliente es599={ALTAS_SON_599} />;
}
