import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ofertaDe599 } from "@/lib/plans/oferta";
import { metodoDePagoGuardado } from "@/lib/plans/peludos-599";
import { ESTADOS_VIVOS } from "@/lib/plans/suscripciones";
import { ActivarMembresia } from "./ActivarMembresia";

/**
 * Activar la membresía $599 de un peludo ya registrado (sección 4): el
 * segundo en adelante, o el que se registró en el alta sin pagar todavía.
 */
export default async function MembresiaDePeludoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/iniciar-sesion?next=/app/peludos/${id}/membresia`);
  const admin = createAdminClient();

  const [{ data: pet }, { data: suyas }] = await Promise.all([
    admin.from("pets").select("id, name, user_id, is_active").eq("id", id).maybeSingle(),
    admin.from("subscriptions").select("status, pet_id").eq("user_id", user.id),
  ]);
  if (!pet || pet.user_id !== user.id || !pet.is_active) redirect("/app/peludos");
  const vivas = (suyas ?? []).filter((s) => ESTADOS_VIVOS.includes(s.status ?? ""));
  // Miembro de $159 o peludo ya cubierto: aquí no hay nada que activar.
  if (vivas.some((s) => !s.pet_id) || vivas.some((s) => s.pet_id === pet.id))
    redirect("/app/peludos");

  const [oferta, metodo] = await Promise.all([
    ofertaDe599(admin, user.id),
    metodoDePagoGuardado(admin, user.id),
  ]);

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-5 px-5 py-6 md:py-10">
      <div className="flex items-center gap-2.5 text-[13px] font-semibold text-ink-tertiary">
        <Link href="/app/peludos" className="text-teal-deep">
          Mis peludos
        </Link>
        <span>›</span>
        <span>Membresía de {pet.name}</span>
      </div>
      {oferta ? (
        <ActivarMembresia
          petId={pet.id}
          petName={pet.name}
          oferta={oferta}
          tarjeta={metodo?.etiqueta ?? null}
        />
      ) : (
        <div className="rounded-[16px] bg-white p-6 text-[15px] text-ink-secondary shadow-[var(--shadow-card)]">
          La membresía no está disponible en este momento. Intenta más tarde.
        </div>
      )}
    </div>
  );
}
