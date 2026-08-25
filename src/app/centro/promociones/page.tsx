import { createAdminClient } from "@/lib/supabase/admin";
import { PromotionsCard, type PromotionRow } from "../PromotionsCard";
import { getCenterContext } from "../shared";

export const metadata = {
  title: "Promociones · Centro aliado · Club Pata Amiga",
};

/** Promociones del centro: alta, pausa y borrado. Los miembros las ven al instante. */
export default async function CentroPromocionesPage() {
  const { center } = await getCenterContext();

  const admin = createAdminClient();
  const { data: promotions } = await admin
    .from("center_promotions")
    .select("id, title, description, discount_label, valid_until, is_active")
    .eq("center_id", center.id)
    .order("created_at", { ascending: false });

  return (
    <div className="mx-auto flex w-full max-w-[980px] flex-col gap-5 px-5 py-7 sm:px-8">
      <PromotionsCard promotions={(promotions ?? []) as PromotionRow[]} />
    </div>
  );
}
