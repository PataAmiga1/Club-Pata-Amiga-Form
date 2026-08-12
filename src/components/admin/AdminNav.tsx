"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

/** Grupo Marketing: contenido editable y campañas, colapsado por defecto. */
const MARKETING_ITEMS = [
  { href: "/admin/landings", icon: "🎯", label: "Landings" },
  { href: "/admin/comunicados", icon: "✉️", label: "Comunicados" },
  { href: "/admin/sitio", icon: "🌐", label: "Sitio web" },
];

export function AdminNav({
  petsPending,
  reimbursementsPending,
  ambassadorsPending,
  centersPending = 0,
  appealsPending = 0,
  isSuper = false,
}: {
  petsPending: number;
  reimbursementsPending: number;
  ambassadorsPending: number;
  centersPending?: number;
  appealsPending?: number;
  isSuper?: boolean;
}) {
  const pathname = usePathname();
  const inMarketing = MARKETING_ITEMS.some((m) => pathname.startsWith(m.href));
  const [marketingOpen, setMarketingOpen] = useState(inMarketing);

  // Orden EXACTO pedido por el equipo (11-ago): Resumen · Notificaciones ·
  // Miembros · Mascotas · Embajadores · Centros · Reintegros · Apelaciones
  // (super admin) · Finanzas (super admin) · Vet · Conversaciones · Marketing.
  // Notificaciones lleva el total de pendientes a la derecha (petición del
  // equipo). Finanzas se oculta de la barra para admins normales según la
  // lista; la PÁGINA sigue accesible como decidió el equipo el 16-jul (con
  // desgloses solo para super admin) — pendiente de confirmar con Pablo si
  // también se restringe la página.
  const notifTotal =
    petsPending +
    reimbursementsPending +
    ambassadorsPending +
    centersPending +
    appealsPending;
  const items = [
    { href: "/admin", icon: "📊", label: "Resumen" },
    { href: "/admin/notificaciones", icon: "🔔", label: "Notificaciones", badge: notifTotal, badgeCls: "bg-orange" },
    { href: "/admin/miembros", icon: "👥", label: "Miembros" },
    { href: "/admin/mascotas", icon: "🐾", label: "Mascotas", badge: petsPending, badgeCls: "bg-orange" },
    { href: "/admin/embajadores", icon: "🤝", label: "Embajadores", badge: ambassadorsPending, badgeCls: "bg-white/20" },
    { href: "/admin/centros", icon: "📍", label: "Centros", badge: centersPending, badgeCls: "bg-white/20" },
    { href: "/admin/reintegros", icon: "💚", label: "Reintegros", badge: reimbursementsPending, badgeCls: "bg-pink" },
    ...(isSuper
      ? [
          { href: "/admin/apelaciones", icon: "⚖️", label: "Apelaciones", badge: appealsPending, badgeCls: "bg-pink" },
          { href: "/admin/finanzas", icon: "💰", label: "Finanzas" },
        ]
      : []),
    { href: "/admin/vet", icon: "💬", label: "Vet 24/7" },
    { href: "/admin/conversaciones", icon: "📨", label: "Conversaciones" },
  ];

  return (
    <>
      {items.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex items-center justify-between rounded-[10px] px-3 py-2.5 text-[13.5px] ${
              active
                ? "bg-white/[.12] font-bold text-white"
                : "font-semibold text-white/75 hover:bg-white/[.06]"
            }`}
          >
            <span className="flex items-center gap-2.5">
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </span>
            {item.badge != null && item.badge > 0 && (
              <span
                className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold text-white ${item.badgeCls}`}
              >
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}

      {/* Grupo Marketing — contenido y campañas */}
      <button
        type="button"
        onClick={() => setMarketingOpen((v) => !v)}
        aria-expanded={marketingOpen}
        className={`flex items-center justify-between rounded-[10px] px-3 py-2.5 text-left text-[13.5px] ${
          inMarketing
            ? "font-bold text-white"
            : "font-semibold text-white/75 hover:bg-white/[.06]"
        }`}
      >
        <span className="flex items-center gap-2.5">
          <span aria-hidden>📣</span>
          Marketing
        </span>
        <span aria-hidden className="text-white/50">
          {marketingOpen ? "▾" : "▸"}
        </span>
      </button>
      {marketingOpen &&
        MARKETING_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`ml-3 flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-[13px] ${
                active
                  ? "bg-white/[.12] font-bold text-white"
                  : "font-semibold text-white/70 hover:bg-white/[.06]"
              }`}
            >
              <span aria-hidden>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
    </>
  );
}

/** Versión móvil: chips horizontales con scroll bajo el top bar oscuro. */
export function AdminNavMobile(props: {
  petsPending: number;
  reimbursementsPending: number;
  ambassadorsPending: number;
  centersPending?: number;
  appealsPending?: number;
  isSuper?: boolean;
}) {
  const pathname = usePathname();
  // Mismo orden que la barra de escritorio (equipo, 11-ago)
  const notifTotal =
    props.petsPending +
    props.reimbursementsPending +
    props.ambassadorsPending +
    (props.centersPending ?? 0) +
    (props.appealsPending ?? 0);
  const items = [
    { href: "/admin", icon: "📊", label: "Resumen", badge: 0 },
    { href: "/admin/notificaciones", icon: "🔔", label: "Notificaciones", badge: notifTotal },
    { href: "/admin/miembros", icon: "👥", label: "Miembros", badge: 0 },
    { href: "/admin/mascotas", icon: "🐾", label: "Mascotas", badge: props.petsPending },
    { href: "/admin/embajadores", icon: "🤝", label: "Embajadores", badge: props.ambassadorsPending },
    { href: "/admin/centros", icon: "📍", label: "Centros", badge: props.centersPending ?? 0 },
    { href: "/admin/reintegros", icon: "💚", label: "Reintegros", badge: props.reimbursementsPending },
    ...(props.isSuper
      ? [
          { href: "/admin/apelaciones", icon: "⚖️", label: "Apelaciones", badge: props.appealsPending ?? 0 },
          { href: "/admin/finanzas", icon: "💰", label: "Finanzas", badge: 0 },
        ]
      : []),
    { href: "/admin/vet", icon: "💬", label: "Vet 24/7", badge: 0 },
    { href: "/admin/conversaciones", icon: "📨", label: "Conversaciones", badge: 0 },
    // Marketing (en móvil los chips van planos; el orden los agrupa al final)
    { href: "/admin/landings", icon: "🎯", label: "Landings", badge: 0 },
    { href: "/admin/comunicados", icon: "✉️", label: "Comunicados", badge: 0 },
    { href: "/admin/sitio", icon: "🌐", label: "Sitio web", badge: 0 },
  ];
  return (
    <nav className="flex gap-1.5 overflow-x-auto px-3 pb-2.5 [-webkit-overflow-scrolling:touch]">
      {items.map((item) => {
        const active =
          item.href === "/admin"
            ? pathname === "/admin"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-none items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] ${
              active
                ? "bg-white/[.16] font-bold text-white"
                : "bg-white/[.06] font-semibold text-white/75"
            }`}
          >
            <span aria-hidden>{item.icon}</span>
            {item.label}
            {item.badge > 0 && (
              <span className="rounded-full bg-orange px-1.5 py-0.5 text-[9.5px] font-extrabold text-white">
                {item.badge}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

