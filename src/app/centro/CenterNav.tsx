"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DashboardEntry } from "@/components/app/ProfileMenu";

/**
 * Menú del portal del centro aliado — espejo del portal del embajador
 * (decisión 2.1, equipo 19-ago): tabs arriba en escritorio y barra fija abajo
 * en móvil. Antes /centro era una sola pantalla larga sin menú.
 */
const ITEMS = [
  { href: "/centro", icon: "🏠", label: "Resumen", short: "Resumen" },
  {
    href: "/centro/promociones",
    icon: "🎁",
    label: "Promociones",
    short: "Promos",
  },
  { href: "/centro/pagos", icon: "💳", label: "Pagos", short: "Pagos" },
  { href: "/centro/cuenta", icon: "⚙️", label: "Mi cuenta", short: "Cuenta" },
] as const;

function isActive(pathname: string, href: string) {
  return href === "/centro" ? pathname === "/centro" : pathname.startsWith(href);
}

/**
 * CAMBIAR DE PANEL SALE TAMBIÉN EN LA BARRA (equipo, 2-sep). Antes solo estaba
 * en el menú del avatar, mientras que el área de miembro sí traía el ícono en
 * su barra: quien entraba aquí no tenía forma obvia de volver. Pidieron
 * "homologar", y Pablo eligió que salga en las dos.
 *
 * Los destinos llegan como propiedad y son LOS MISMOS que pinta el menú
 * —salen de una sola lista en el layout—, que es lo único que evita que
 * vuelvan a decir cosas distintas.
 */
export function CenterNav({ extra = [] }: { extra?: DashboardEntry[] }) {
  const pathname = usePathname();
  const items = [
    ...ITEMS,
    ...extra.map((e) => ({ ...e, short: e.short ?? e.label })),
  ];
  return (
    <>
      {/* Escritorio: tabs bajo el encabezado */}
      <nav className="mx-auto hidden w-full max-w-[980px] gap-2 px-5 pt-5 sm:flex sm:px-8">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={
              isActive(pathname, item.href)
                ? "rounded-full bg-teal px-5 py-2.5 text-[13px] font-bold text-white"
                : "rounded-full border-[1.5px] border-border-input bg-white px-5 py-2.5 text-[13px] font-semibold text-ink-secondary transition-colors hover:border-teal hover:text-teal-deep"
            }
          >
            {item.icon} {item.label}
          </Link>
        ))}
      </nav>
      {/* Móvil: barra fija abajo */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-around border-t border-border-divider bg-white px-2 pb-[max(env(safe-area-inset-bottom),1rem)] pt-3 sm:hidden">
        {items.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-col items-center gap-[3px] text-[10px] ${
              isActive(pathname, item.href)
                ? "font-bold text-teal-deep"
                : "font-semibold text-ink-tertiary"
            }`}
          >
            <span className="text-[19px]" aria-hidden>
              {item.icon}
            </span>
            {item.short}
          </Link>
        ))}
      </nav>
    </>
  );
}
