import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateEs } from "@/lib/dates";
import { DetailModal, DetailItem } from "@/components/panel/DetailModal";
import { FilterChips } from "@/components/panel/FilterChips";
import { AppealReviewRow } from "./AppealReviewRow";

type Row = {
  id: string;
  folio: string;
  reason: string;
  status: string;
  created_at: string;
  resolution_notes: string | null;
  reimbursement_id: string | null;
  pet_id: string | null;
  center_id: string | null;
  /** Adjuntos que mandó el miembro con su apelación (equipo, 15-ago). */
  documents: { path: string; name: string; type: string }[] | null;
  profiles: { first_name: string | null; last_name: string | null; email: string | null } | null;
  reimbursements: { folio: string; rejection_reason: string | null } | null;
  pets: { name: string; approval_notes: string | null } | null;
  wellness_centers: { name: string; rejection_reason: string | null } | null;
};

const one = <T,>(v: T | T[] | null): T | null =>
  Array.isArray(v) ? (v[0] ?? null) : v;

export default async function AdminApelacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string; orden?: string }>;
}) {
  const { estado, orden } = await searchParams;
  // Por omisión las más recientes arriba, con filtro para invertir (Fase 4)
  const masAntiguas = orden === "antiguas";
  // Las apelaciones son EXCLUSIVAS del super admin (regla del sitio vivo)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: myProfile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  if (myProfile?.role !== "super_admin") redirect("/admin");

  const admin = createAdminClient();
  const { data } = await admin
    .from("appeals")
    .select(
      "id, folio, reason, status, created_at, resolution_notes, reimbursement_id, pet_id, center_id, documents, profiles!user_id(first_name, last_name, email), reimbursements(folio, rejection_reason), pets(name, approval_notes), wellness_centers(name, rejection_reason)",
    )
    .order("created_at", { ascending: masAntiguas });

  const rows = (data ?? []).map((r) => ({
    ...r,
    profiles: one(r.profiles),
    reimbursements: one(r.reimbursements),
    pets: one(r.pets),
    wellness_centers: one(r.wellness_centers),
  })) as Row[];

  const filtered = rows.filter((a) => !estado || a.status === estado);

  // Ligas FIRMADAS de los adjuntos: `appeal-documents` es privado, así que la
  // ruta guardada no sirve por sí sola. Se firman al pintar, como la INE.
  const adjuntosFirmados = new Map<string, { name: string; url: string }[]>(
    await Promise.all(
      filtered.map(async (a) => {
        const docs = a.documents ?? [];
        const firmados = await Promise.all(
          docs.map(async (d) => {
            const { data } = await admin.storage
              .from("appeal-documents")
              .createSignedUrl(d.path, 3600);
            return { name: d.name, url: data?.signedUrl ?? "" };
          }),
        );
        return [a.id, firmados.filter((f) => f.url)] as const;
      }),
    ),
  );
  const pending = filtered.filter((a) => a.status === "pending");
  const resolved = filtered.filter((a) => a.status !== "pending");

  const memberName = (a: Row) =>
    a.profiles?.first_name
      ? `${a.profiles.first_name} ${a.profiles.last_name ?? ""}`.trim()
      : (a.profiles?.email ?? "Miembro");
  const subjectOf = (a: Row) =>
    a.reimbursement_id
      ? `Reintegro ${a.reimbursements?.folio ?? ""}`
      : a.pet_id
        ? `Peludo: ${a.pets?.name ?? ""}`
        : `Centro: ${a.wellness_centers?.name ?? ""}`;
  const originalOf = (a: Row) =>
    a.reimbursement_id
      ? (a.reimbursements?.rejection_reason ?? "Denegado")
      : a.pet_id
        ? (a.pets?.approval_notes ?? "Perfil denegado")
        : (a.wellness_centers?.rejection_reason ?? "Solicitud denegada");

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-col gap-1">
        <h1 className="font-display text-[26px] text-ink-title">
          Apelaciones
        </h1>
        <p className="max-w-[560px] text-sm text-ink-secondary">
          Segundas revisiones solicitadas por los miembros. Aceptar una
          apelación reabre el reintegro (vuelve a la cola) o aprueba el perfil
          del peludo.
        </p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          basePath="/admin/apelaciones"
          current={estado}
          keep={{ orden }}
          options={[
            { value: "pending", label: "Por revisar" },
            { value: "approved", label: "Aceptadas" },
            { value: "rejected", label: "Mantenidas" },
            { value: "closed", label: "Cerradas" },
          ]}
        />
        <FilterChips
          basePath="/admin/apelaciones"
          current={orden}
          param="orden"
          keep={{ estado }}
          allLabel="Más recientes"
          options={[{ value: "antiguas", label: "Más antiguas" }]}
        />
      </div>
      <h2 className="font-display text-lg text-ink-title">Por revisar</h2>
      <div className="flex flex-col gap-2.5">
        {pending.map((a) => (
          <AppealReviewRow
            key={a.id}
            appeal={{
              id: a.id,
              folio: a.folio,
              subject: subjectOf(a),
              originalDecision: originalOf(a),
              member: memberName(a),
              message: a.reason,
              submitted: formatDateEs(new Date(a.created_at)),
              detailHref: a.reimbursement_id
                ? `/admin/reintegros/${a.reimbursement_id}`
                : a.center_id
                  ? "/admin/centros"
                  : null,
            }}
            detailSlot={
              <DetailModal title={`Apelación ${a.folio}`}>
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <DetailItem label="FOLIO" value={a.folio} />
                    <DetailItem
                      label="ESTADO"
                      value={a.status === "pending" ? "Por revisar" : a.status}
                    />
                    <DetailItem label="SUJETO" value={subjectOf(a)} />
                    <DetailItem label="PRESENTADA POR" value={memberName(a)} />
                    <DetailItem label="CORREO" value={a.profiles?.email} />
                    <DetailItem
                      label="FECHA"
                      value={formatDateEs(new Date(a.created_at))}
                    />
                  </div>
                  <DetailItem label="DECISIÓN ORIGINAL" value={originalOf(a)} />
                  <div className="flex flex-col gap-1">
                    <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                      ARGUMENTO COMPLETO
                    </span>
                    <p className="rounded-[10px] bg-cream px-3 py-2.5 text-[13px] leading-relaxed text-ink-body">
                      «{a.reason}»
                    </p>
                  </div>
                  {/* Lo que adjuntó el miembro: es la razón de ser de la
                      apelación cuando lo rechazado fue una foto. */}
                  {(adjuntosFirmados.get(a.id)?.length ?? 0) > 0 && (
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                        LO QUE ADJUNTÓ
                      </span>
                      <div className="flex flex-wrap gap-2">
                        {adjuntosFirmados.get(a.id)!.map((d) => (
                          <a
                            key={d.url}
                            href={d.url}
                            target="_blank"
                            className="rounded-full border-[1.5px] border-border-input px-3 py-1.5 text-[12px] font-bold text-teal-deep transition-colors hover:border-teal"
                          >
                            📎 {d.name} ↗
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </DetailModal>
            }
          />
        ))}
        {pending.length === 0 && (
          <div className="rounded-[18px] bg-white p-6 text-sm text-ink-secondary shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            Sin apelaciones pendientes. 🎉
          </div>
        )}
      </div>

      {resolved.length > 0 && (
        <>
          <h2 className="font-display text-lg text-ink-title">Resueltas</h2>
          <div className="flex flex-col rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            {resolved.map((a) => (
              <DetailModal
                key={a.id}
                title={`Apelación ${a.folio}`}
                trigger={
                  <div className="flex items-center gap-3 border-b border-[#F2EEE4] px-1 py-2.5 text-[13px] text-ink-body">
                    <span className="font-bold text-teal-deep">{a.folio}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {subjectOf(a)} · {memberName(a)}
                      {a.resolution_notes ? (
                        <span className="text-ink-tertiary">
                          {" "}
                          · {a.resolution_notes}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={`flex-none rounded-full px-2.5 py-1 text-[10.5px] font-extrabold ${
                        a.status === "approved"
                          ? "bg-success-bg text-success-text"
                          : "bg-error-bg text-error-text"
                      }`}
                    >
                      {a.status === "approved"
                        ? "ACEPTADA"
                        : a.status === "closed"
                          ? "CERRADA"
                          : "MANTENIDA"}
                    </span>
                  </div>
                }
              >
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <DetailItem label="FOLIO" value={a.folio} />
                    <DetailItem label="ASUNTO" value={subjectOf(a)} />
                    <DetailItem label="MIEMBRO" value={memberName(a)} />
                    <DetailItem label="CORREO" value={a.profiles?.email} />
                    <DetailItem
                      label="RESOLUCIÓN"
                      value={
                        a.status === "approved"
                          ? "Aceptada — vuelve a revisión"
                          : a.status === "closed"
                            ? "Cerrada"
                            : "Decisión original mantenida"
                      }
                    />
                    <DetailItem
                      label="PRESENTADA"
                      value={formatDateEs(new Date(a.created_at))}
                    />
                  </div>
                  <div className="flex flex-col gap-2.5 rounded-[12px] bg-cream p-3.5">
                    <DetailItem label="MOTIVO DE LA APELACIÓN" value={a.reason} />
                    <DetailItem
                      label="DECISIÓN ORIGINAL APELADA"
                      value={
                        a.reimbursements?.rejection_reason ??
                        a.pets?.approval_notes ??
                        a.wellness_centers?.rejection_reason
                      }
                    />
                    <DetailItem label="NOTAS DE RESOLUCIÓN" value={a.resolution_notes} />
                  </div>
                </div>
              </DetailModal>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
