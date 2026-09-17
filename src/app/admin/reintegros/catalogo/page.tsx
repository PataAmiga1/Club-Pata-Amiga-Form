import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAdminRoute } from "@/lib/admin-guard";
import { leerCatalogo } from "@/lib/catalogo-cuidados";
import { CatalogoEditor } from "./CatalogoEditor";

/**
 * Catálogo de cuidados cotidianos de la membresía $599. Lo que no está aquí no
 * se reintegra de la bolsa de cuidados; lo que se agrega aplica para todos.
 */
export default async function CatalogoCuidadosPage() {
  const sesion = await requireAdminRoute();
  if (!sesion) redirect("/iniciar-sesion?next=/admin/reintegros/catalogo");

  const grupos = await leerCatalogo(sesion.admin, { incluirInactivos: true });
  const activos = grupos.reduce(
    (n, g) => n + g.conceptos.filter((c) => c.activo).length,
    0,
  );

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-col gap-1">
        <Link
          href="/admin/reintegros"
          className="text-[12.5px] font-semibold text-teal-deep hover:underline"
        >
          ← Reintegros
        </Link>
        <h1 className="font-display text-[26px] text-ink-title">
          Catálogo de cuidados cotidianos
        </h1>
        <p className="max-w-[680px] text-sm leading-relaxed text-ink-secondary">
          Membresía $599. La bolsa de cuidados cotidianos reintegra{" "}
          <strong>solo lo que está en esta lista</strong> ({activos} conceptos
          activos). Si un caso lo amerita, agrégalo: aplica para todos los
          miembros desde ese momento. Los conceptos no se borran, se
          desactivan.
        </p>
      </div>

      <CatalogoEditor grupos={grupos} />
    </div>
  );
}
