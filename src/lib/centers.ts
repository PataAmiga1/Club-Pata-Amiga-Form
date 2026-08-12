import { createClient } from "@/lib/supabase/server";
import { hoyEnMexico } from "@/lib/zona-horaria";
import type { CenterCardData } from "@/components/centros/CentersExplorer";

/** Approved wellness centers with locations and live promotions (public RLS read). */
export async function fetchApprovedCenters(): Promise<CenterCardData[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("wellness_centers")
    .select(
      "id, name, services, member_benefit, logo_url, phone, website, wellness_center_locations(address, city, state, colony, postal_code, phone), center_promotions(title, discount_label, valid_until, is_active)",
    )
    .eq("status", "approved")
    .order("created_at", { ascending: true });

  // Hoy en México: una promoción que vence hoy no debe desaparecer 6 horas
  // antes porque el servidor ya cambió de día.
  const today = hoyEnMexico();

  return (data ?? []).map((c) => ({
    id: c.id,
    name: c.name,
    services: c.services ?? [],
    memberBenefit: c.member_benefit,
    logoUrl: c.logo_url,
    phone: c.phone,
    website: c.website,
    locations: (c.wellness_center_locations ?? []).map((l) => ({
      address: l.address,
      city: l.city,
      state: l.state,
      colony: l.colony,
      postalCode: l.postal_code,
      phone: l.phone,
    })),
    // Solo promociones activas y vigentes llegan al directorio
    promotions: (c.center_promotions ?? [])
      .filter((p) => p.is_active && (!p.valid_until || p.valid_until >= today))
      .map((p) => ({
        title: p.title,
        discountLabel: p.discount_label,
        validUntil: p.valid_until,
      })),
  }));
}
