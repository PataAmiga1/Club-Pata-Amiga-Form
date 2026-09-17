import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { RegistroHeader } from "@/components/registro/Header";
import { BenefitsMarquee } from "@/components/landing/BenefitsMarquee";
import { PlanSelector } from "./PlanSelector";
import { DemoAgenteWidget } from "@/components/app/DemoAgenteWidget";
import { mostrarAgenteDemo } from "@/lib/demo-agent";
import { createAdminClient } from "@/lib/supabase/admin";
import { ALTAS_SON_599 } from "@/lib/plans/planes";
import { ofertaDe599 } from "@/lib/plans/oferta";
import { leerCatalogo } from "@/lib/catalogo-cuidados";
import { ESTADOS_VIVOS } from "@/lib/plans/suscripciones";
import { PlanSelector599 } from "./PlanSelector599";

export default async function PlanPage({
  searchParams,
}: {
  searchParams: Promise<{ codigo?: string }>;
}) {
  const { codigo } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/registro");

  // Already a paying member? Plan changes live in Mi cuenta.
  const { data: profile } = await supabase
    .from("profiles")
    .select("membership_status")
    .eq("id", user.id)
    .single();
  // En el $159 una membresía cubre la cuenta. En el $599 se paga por peludo,
  // así que un miembro activo SÍ vuelve aquí a pagar a su siguiente peludo.
  if (profile?.membership_status === "active" && !ALTAS_SON_599)
    redirect("/app/cuenta");

  const { data: pets } = await supabase
    .from("pets")
    .select("id, name")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  let petName = pets?.[0]?.name ?? "tu peludo";

  // Membresía $599: el peludo que se va a pagar es el más antiguo que todavía
  // no tiene su suscripción (el mismo que elige el checkout).
  let oferta: Awaited<ReturnType<typeof ofertaDe599>> = null;
  let catalogo: Awaited<ReturnType<typeof leerCatalogo>> = [];
  if (ALTAS_SON_599) {
    const admin = createAdminClient();
    const [ofertaLeida, catalogoLeido, { data: suyas }] = await Promise.all([
      ofertaDe599(admin, user.id),
      leerCatalogo(admin),
      admin.from("subscriptions").select("pet_id, status").eq("user_id", user.id),
    ]);
    oferta = ofertaLeida;
    catalogo = catalogoLeido;
    const vivas = (suyas ?? []).filter((s) => ESTADOS_VIVOS.includes(s.status ?? ""));
    // Miembro de $159: su membresía ya cubre hasta 3 peludos y no contrata el
    // $599 (el checkout también lo frena). No se le enseña una oferta que no
    // puede comprar.
    if (vivas.some((s) => !s.pet_id)) redirect("/app/peludos");
    const cubiertos = new Set(vivas.map((s) => s.pet_id));
    const pendiente = (pets ?? []).find((p) => !cubiertos.has(p.id));
    // Todos sus peludos ya tienen membresía: no hay nada que pagar aquí.
    if (!pendiente && (pets ?? []).length > 0) redirect("/app/peludos");
    petName = pendiente?.name ?? petName;
  }
  // Aquí es donde más ayuda: está decidiendo si paga (sección 6, punto 3).
  const demo = await mostrarAgenteDemo(user.id);

  return (
    <div className="flex min-h-dvh flex-col bg-cream">
      <RegistroHeader step={3} />
      {/* Banda de beneficios — refuerzo en móvil como en la app anterior. Dice
          «hasta 3 peludos», así que no va con el $599. */}
      {!ALTAS_SON_599 && (
        <div className="sm:hidden">
          <BenefitsMarquee variant="light" />
        </div>
      )}
      <div className="flex-1 pb-14 pt-4 sm:pt-11">
        <div className="mx-auto flex w-full max-w-[760px] flex-col gap-4 px-5 sm:gap-7 sm:px-0">
          {!ALTAS_SON_599 ? (
            <PlanSelector petName={petName} initialCode={codigo} />
          ) : oferta ? (
            <PlanSelector599
              petName={petName}
              initialCode={codigo}
              oferta={oferta}
              catalogo={catalogo}
            />
          ) : (
            <div className="rounded-[16px] bg-white p-6 text-center text-[15px] text-ink-secondary shadow-[var(--shadow-card)]">
              La membresía no está disponible en este momento. Intenta más tarde.
            </div>
          )}
        </div>
      </div>
      {demo && <DemoAgenteWidget />}
    </div>
  );
}
