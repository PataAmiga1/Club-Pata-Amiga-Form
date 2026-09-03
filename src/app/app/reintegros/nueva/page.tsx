import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cuentasDelMiembro } from "@/lib/cuentas-bancarias";
import { waitingProgress } from "@/lib/dates";
import { beneficiosDe, topesDe } from "@/lib/plans/resolve";
import {
  calculateBalances,
  startOfCurrentYear,
} from "@/lib/reimbursement-balance";
import { RequestForm, type EligiblePet } from "./RequestForm";

export default async function NuevaSolicitudPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/iniciar-sesion?next=/app/reintegros/nueva");

  const [
    { data: profile },
    { data: pets },
    { data: lastReq },
    { data: yearRows },
    { data: sub },
    cuentas,
  ] = await Promise.all([
      supabase
        .from("profiles")
        .select("membership_status, profile_completed, first_name, last_name")
        .eq("id", user.id)
        .single(),
      supabase
        .from("pets")
        .select(
          "id, name, species, approval_status, waiting_period_end_date, waiting_period_start_date, waiting_period_bypassed, created_at",
        )
        .eq("user_id", user.id)
        .eq("is_active", true)
        .order("created_at", { ascending: true }),
      supabase
        .from("reimbursements")
        .select("clabe")
        .eq("user_id", user.id)
        .not("clabe", "is", null)
        .order("created_at", { ascending: false })
        .limit(1),
      // Saldo anual por categoría: solo cuentan las solicitudes de este año
      supabase
        .from("reimbursements")
        .select("category, amount_requested, amount_approved, status")
        .eq("user_id", user.id)
        .gte("created_at", startOfCurrentYear()),
      // Topes del plan que contrató este miembro (grandfathering)
      supabase
        .from("subscriptions")
        .select("benefits_snapshot")
        .eq("user_id", user.id)
        .in("status", ["active", "past_due"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      cuentasDelMiembro(createAdminClient(), user.id),
  ]);

  if (profile?.membership_status !== "active") redirect("/app");

  const petOptions: EligiblePet[] = (pets ?? []).map((p) => {
    const wait = waitingProgress(
      p.created_at,
      p.waiting_period_end_date,
      p.waiting_period_bypassed,
      p.waiting_period_start_date,
    );
    return {
      id: p.id,
      name: p.name,
      species: p.species as "dog" | "cat",
      eligible: p.approval_status === "approved" && wait.done,
      waitLabel: wait.done ? "disponible" : `en tiempo de espera (${wait.elapsed}/${wait.total})`,
      pendingApproval: p.approval_status !== "approved" && wait.done,
    };
  });

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-[22px] px-5 py-6 md:py-10">
      <div className="flex items-center gap-2.5 text-[13px] font-semibold text-ink-tertiary">
        <Link href="/app/reintegros" className="text-teal-deep">
          Reintegros
        </Link>
        <span>›</span>
        <span>Nueva solicitud</span>
      </div>
      <div>
        <h1 className="font-display text-[30px] text-ink-title md:text-4xl">
          Solicita tu reintegro
        </h1>
        <p className="mt-1.5 text-[14.5px] leading-normal text-ink-secondary">
          Acudes a tu veterinario de confianza, nos envías la factura y te
          reintegramos en 72 horas por transferencia bancaria.
        </p>
      </div>
      {!profile.profile_completed && (
        <div className="rounded-[14px] bg-warning-bg px-4 py-3.5 text-sm leading-normal text-warning-text">
          Antes de solicitar un reintegro necesitas{" "}
          <Link href="/app/perfil" className="font-bold underline">
            completar tu perfil
          </Link>{" "}
          (CURP y domicilio).
        </div>
      )}
      <RequestForm
        userId={user.id}
        pets={petOptions}
        /* Las cuentas guardadas (hasta 3 desde el 2-sep). Si no tiene ninguna
           —o si su CLABE nunca se guardó en el perfil— se cae a la del último
           reintegro, que es lo que se hacía antes. */
        cuentas={cuentas}
        ultimaClabe={lastReq?.[0]?.clabe ?? ""}
        holderName={[profile?.first_name, profile?.last_name]
          .filter(Boolean)
          .join(" ")}
        balances={calculateBalances(
          yearRows ?? [],
          topesDe(
            beneficiosDe(sub?.benefits_snapshot as Record<string, unknown> | null),
          ),
        )}
        blocked={!profile.profile_completed}
      />
    </div>
  );
}
