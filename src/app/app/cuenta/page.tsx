import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { renewalDate, formatDateEs } from "@/lib/dates";
import { situacionDeCobro } from "@/lib/membresia";
import { PagoPendienteCard } from "./PagoPendienteCard";
import { MembershipManager } from "./MembershipManager";
import { BillingCard } from "./BillingCard";
import { BankingCard } from "./BankingCard";
import { ChangePasswordCard } from "@/components/app/ChangePasswordCard";
import { fetchSiteSettings } from "@/lib/site";
import { LogoutButton } from "@/components/app/LogoutButton";

export default async function CuentaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/iniciar-sesion?next=/app/cuenta");

  const [{ data: profile }, { data: sub }] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "first_name, last_name, email, phone, membership_status, member_since, cfdi_requested, rfc, razon_social, regimen_fiscal, uso_cfdi, cp_fiscal, bank_name, clabe",
      )
      .eq("id", user.id)
      .single(),
    // Se piden TODAS las no canceladas, no solo las activas (29-ago): con
    // `.eq("status","active")` quien tenía la renovación fallida veía su
    // cuenta como si no tuviera membresía, y eso lo empujaba a contratar de
    // nuevo — que fue lo que produjo un cobro duplicado real.
    supabase
      .from("subscriptions")
      .select("plan, amount, status, cancel_at_period_end, current_period_end")
      .eq("user_id", user.id)
      .neq("status", "canceled")
      .maybeSingle(),
  ]);

  const settings = await fetchSiteSettings();
  const enMora = sub?.status === "past_due" || sub?.status === "unpaid";
  // A `situacionDeCobro` se le sigue pasando solo la activa: lo que pinta para
  // una membresía sana no cambia. La mora se resuelve con su propia tarjeta.
  const situacion = situacionDeCobro(
    profile?.membership_status,
    sub?.status === "active" ? sub : null,
  );
  // La fecha de renovación SOLO se calcula cuando el cobro vive aquí. Para un
  // heredado, `member_since + 1 mes` daba una fecha ya pasada (auditoría 11-ago).
  const renews =
    situacion.tipo === "stripe"
      ? renewalDate(
          sub?.current_period_end ?? null,
          profile?.member_since ?? null,
          sub?.plan ?? null,
        )
      : null;
  // Un heredado que ya pidió su baja: el corte lo fija el comité a mano.
  let bajaSolicitada = false;
  if (situacion.tipo === "heredado") {
    const { count } = await supabase
      .from("cancellations")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id);
    bajaSolicitada = (count ?? 0) > 0;
  }

  return (
    <div className="mx-auto flex w-full max-w-[640px] flex-col gap-[22px] px-5 py-6 md:py-10">
      <div>
        <h1 className="font-display text-[28px] text-ink-title md:text-[34px]">
          Mi cuenta
        </h1>
        <p className="mt-1.5 text-[14.5px] text-ink-secondary">
          Tu membresía, tu plan y tus datos de contacto.
        </p>
      </div>

      {/* Lo primero que tiene que ver quien trae un cobro fallido: qué pasó y
          cómo se arregla, antes que cualquier otra cosa de la pantalla. */}
      {enMora && <PagoPendienteCard />}

      {/* Contact info */}
      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] md:p-[26px]">
        <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
          TUS DATOS
        </span>
        <div className="flex flex-col gap-1 text-sm text-ink-body">
          <span className="font-bold text-ink-title">
            {[profile?.first_name, profile?.last_name].filter(Boolean).join(" ") ||
              "Sin nombre registrado"}
          </span>
          <span>{profile?.email}</span>
          {profile?.phone && <span>{profile.phone}</span>}
          <a href="/app/perfil" className="mt-1 text-[13px] font-semibold text-teal-deep">
            Editar mi perfil →
          </a>
        </div>
      </section>

      {/* Tres casos, no dos: con Stripe, heredado de Memberstack, o sin
          membresía. Antes un heredado (60 de 63 activos) caía en el aviso
          amarillo de "no tienes membresía" con un botón para volver a pagar. */}
      {situacion.tipo === "stripe" ? (
        <MembershipManager
          plan={situacion.plan}
          cancelAtPeriodEnd={situacion.cancelaAlCorte}
          renewsLabel={renews ? formatDateEs(renews) : null}
          periodEndIso={renews ? renews.toISOString() : null}
        />
      ) : situacion.tipo === "heredado" ? (
        <MembershipManager
          heredado
          bajaSolicitada={bajaSolicitada}
          plan="monthly"
          cancelAtPeriodEnd={false}
          renewsLabel={null}
          periodEndIso={null}
        />
      ) : (
        <section className="flex flex-col items-start gap-3 rounded-[20px] bg-warning-bg p-5 md:p-[26px]">
          <span className="text-sm font-bold text-warning-text">
            No tienes una membresía activa.
          </span>
          <a
            href="/registro/plan"
            className="grid h-11 place-items-center rounded-full bg-teal px-6 text-[13px] font-bold text-white"
          >
            Unirme a la manada
          </a>
        </section>
      )}

      <BillingCard
        initial={{
          cfdiRequested: profile?.cfdi_requested ?? false,
          rfc: profile?.rfc ?? null,
          razonSocial: profile?.razon_social ?? null,
          regimenFiscal: profile?.regimen_fiscal ?? null,
          usoCfdi: profile?.uso_cfdi ?? null,
          cpFiscal: profile?.cp_fiscal ?? null,
        }}
      />

      <BankingCard
        initialBank={profile?.bank_name ?? null}
        initialClabe={profile?.clabe ?? null}
      />

      <ChangePasswordCard />

      {/* Soporte: contacto y emergencias siempre a la mano */}
      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)] md:p-[26px]">
        <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
          SOPORTE
        </span>
        <div className="flex flex-col gap-2 text-sm text-ink-body">
          <a
            href={`mailto:${settings.contact_email}`}
            className="font-semibold text-teal-deep hover:underline"
          >
            ✉️ {settings.contact_email}
          </a>
          {settings.emergency_phone && (
            <a
              href={`tel:${settings.emergency_phone.replace(/\s/g, "")}`}
              className="font-semibold text-error-text hover:underline"
            >
              🚨 Emergencias: {settings.emergency_phone}
            </a>
          )}
          <a
            href="/app/vet"
            className="font-semibold text-teal-deep hover:underline"
          >
            💬 Orientación veterinaria 24/7
          </a>
        </div>
      </section>

      {/* Cerrar sesión — también accesible en móvil (el sidebar es desktop) */}
      <div className="flex justify-center pb-4">
        <LogoutButton variant="button" />
      </div>
    </div>
  );
}
