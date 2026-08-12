import Link from "next/link";
import { getAdminRole } from "@/lib/admin-guard";
import { EnvioForm } from "./EnvioForm";

/**
 * Envíos dirigidos y extraordinarios (equipo, 5-ago): elegir a quién se le
 * escribe (filtros o lista), pegar un HTML nuevo, y disparar los
 * recordatorios de datos faltantes. Enviar es exclusivo del super admin.
 */
export default async function AdminEnviosPage() {
  const isSuper = (await getAdminRole()) === "super_admin";

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/admin/comunicados"
          className="text-sm font-semibold text-teal-deep"
        >
          ← Comunicados
        </Link>
        <h1 className="font-display text-[26px] text-ink-title">
          Envíos dirigidos
        </h1>
      </div>
      <EnvioForm isSuper={isSuper} />
    </div>
  );
}
