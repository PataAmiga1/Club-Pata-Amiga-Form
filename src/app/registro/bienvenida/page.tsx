import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getStripe } from "@/lib/stripe";
import { PurchaseEvent } from "@/components/analytics/PurchaseEvent";

export default async function BienvenidaPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/registro");

  // Verify the Stripe checkout actually completed.
  // De paso se guarda el MONTO REAL cobrado: es el valor que se manda a GA4 y
  // al píxel de Meta. Un monto fijo en el código hace mentir a todo reporte de
  // campañas en cuanto cambia un precio o entra un cupón.
  let compra: { montoCentavos: number; moneda: string; transaccion: string } | null =
    null;
  if (session_id) {
    try {
      const session = await getStripe().checkout.sessions.retrieve(session_id);
      if (session.payment_status !== "paid") redirect("/registro/plan");
      compra = {
        montoCentavos: session.amount_total ?? 0,
        moneda: session.currency ?? "mxn",
        transaccion: session.id,
      };
    } catch {
      redirect("/registro/plan");
    }
  }

  const { data: pets } = await supabase
    .from("pets")
    .select("name, waiting_period_end_date, waiting_period_start_date, created_at")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1);
  const pet = pets?.[0];
  // La espera arranca al APROBARSE la ficha (PM, 11-ago): recién pagado, la
  // mascota aún no tiene fechas. Si las tiene (ya la aprobaron), se muestran.
  const days =
    pet?.waiting_period_end_date && pet?.waiting_period_start_date
      ? Math.max(
          1,
          Math.round(
            (new Date(`${pet.waiting_period_end_date}T12:00:00`).getTime() -
              new Date(`${pet.waiting_period_start_date}T12:00:00`).getTime()) /
              86_400_000,
          ),
        )
      : null;

  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-teal px-6 py-16">
      {compra && (
        <PurchaseEvent
          montoCentavos={compra.montoCentavos}
          moneda={compra.moneda}
          transaccion={compra.transaccion}
        />
      )}
      <div className="blob absolute -left-[90px] -top-[70px] size-[320px] bg-white/[.12]" />
      <div
        className="absolute -bottom-[120px] -right-[100px] size-[380px] bg-white/10"
        style={{
          borderRadius: "58% 42% 45% 55% / 48% 57% 43% 52%",
        }}
      />
      <div className="relative flex w-full max-w-[560px] flex-col items-center gap-[18px] text-center">
        <Image
          src="/brand/logo-color.svg"
          alt="Pata Amiga"
          width={220}
          height={80}
          className="w-[220px]"
          priority
        />
        <h1 className="font-display text-[40px] leading-[1.05] text-white sm:text-[52px]">
          ¡Bienvenido
          <br />a la manada!
        </h1>
        <p className="text-base leading-relaxed text-white/[.92]">
          Tu membresía está activa y la orientación veterinaria 24/7 ya está
          disponible.
          {pet &&
            (days ? (
              <>
                {" "}
                {pet.name} entra a revisión del comité y su período de espera
                de {days} días ya está en curso.
              </>
            ) : (
              <>
                {" "}
                {pet.name} entra a revisión del comité; en cuanto su ficha sea
                aprobada empezará su período de espera.
              </>
            ))}
        </p>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            href="/app"
            className="grid h-[52px] place-items-center rounded-full bg-white px-7 text-[15px] font-bold text-teal-deep transition-colors hover:bg-cream-light"
          >
            Ir a mi manada
          </Link>
          <Link
            href="/app/perfil"
            className="grid h-[52px] place-items-center rounded-full border-2 border-white/60 px-7 text-[15px] font-bold text-white transition-colors hover:border-white"
          >
            Completar mi perfil
          </Link>
        </div>
      </div>
    </main>
  );
}
