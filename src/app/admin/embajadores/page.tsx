import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminRole } from "@/lib/admin-guard";
import { formatDateEs } from "@/lib/dates";
import { formatMxn } from "@/lib/format";
import { AMBASSADOR_PAYOUT_DAY } from "@/lib/constants";
import { inicioDelMes } from "@/lib/zona-horaria";
import { ligaFirmadaDeIne } from "@/lib/documentos-ine";
import { ExpedienteDocumentos } from "@/components/panel/ExpedienteDocumentos";
import {
  documentosDeSolicitud,
  documentosRequeridos,
  ETIQUETA_DOCUMENTO,
  type DocumentoFirmado,
  type TipoPersona,
} from "@/lib/documentos-solicitud";
import {
  DetailModal,
  DetailItem,
  SensitiveBlock,
} from "@/components/panel/DetailModal";
import { FilterChips } from "@/components/panel/FilterChips";
import { SocialLinks } from "@/components/panel/SocialLinks";
import { AmbassadorReviewRow } from "./AmbassadorReviewRow";
import {
  AmbassadorResolveButtons,
  AmbassadorDeactivateButton,
} from "./AmbassadorResolveButtons";
import { PayCutButton } from "./PayCutButton";

type LigasFirmadas = { frente: string | null; reverso: string | null };

/**
 * Ligas a la INE del embajador.
 *
 * Distingue tres casos, porque para el comité NO son lo mismo: nunca la subió,
 * la subió y aquí está, o hay algo guardado pero el archivo no se pudo firmar.
 * Ese tercer caso existe de verdad: las 18 filas heredadas de la plataforma
 * anterior apuntan a archivos que en el proyecto de pruebas no están (se copió
 * la base, no el bucket). Antes se pintaba una liga a "#" que no llevaba a
 * ningún lado y parecía que el documento estaba roto.
 */
function LigasIne({
  firmadas,
  guardado,
}: {
  firmadas: LigasFirmadas | undefined;
  guardado: { frente: string | null; reverso: string | null };
}) {
  const lados = [
    { etiqueta: "Ver frente ↗", url: firmadas?.frente, hay: Boolean(guardado.frente) },
    { etiqueta: "Ver reverso ↗", url: firmadas?.reverso, hay: Boolean(guardado.reverso) },
  ].filter((l) => l.hay);

  if (lados.length === 0)
    return (
      <span className="text-[12.5px] text-warning-text">
        Sin identificación — se registró antes de que el alta la pidiera. Puede
        subirla desde su portal.
      </span>
    );

  return (
    <span className="flex flex-wrap gap-3 text-[12.5px]">
      {lados.map((l) =>
        l.url ? (
          <a
            key={l.etiqueta}
            href={l.url}
            target="_blank"
            className="font-bold text-teal-deep hover:underline"
          >
            {l.etiqueta}
          </a>
        ) : (
          <span key={l.etiqueta} className="text-ink-tertiary">
            {l.etiqueta.replace("Ver ", "").replace(" ↗", "")}: archivo no
            disponible
          </span>
        ),
      )}
    </span>
  );
}

type Row = {
  id: string;
  first_name: string;
  last_name: string | null;
  email: string;
  phone: string | null;
  curp: string | null;
  city: string | null;
  state: string | null;
  referral_code: string | null;
  status: string;
  user_id: string | null;
  created_at: string;
  bank_name: string | null;
  clabe: string | null;
  bank_holder: string | null;
  ine_front_url: string | null;
  ine_back_url: string | null;
  birth_date: string | null;
  rfc: string | null;
  /** Persona física o moral (19-ago). En moral, los datos de persona son los
      del representante legal y la entidad vive en `razon_social`. */
  tipo_persona: string | null;
  razon_social: string | null;
  motivation: string | null;
  social_links: Record<string, string> | null;
  deactivation_reason: string | null;
  deactivated_at: string | null;
  referrals: {
    commission_amount: number | null;
    status: string;
    created_at: string;
  }[];
};

export default async function AdminEmbajadoresPage({
  searchParams,
}: {
  searchParams: Promise<{
    estado?: string;
    desde?: string;
    hasta?: string;
    orden?: string;
  }>;
}) {
  const { estado, desde, hasta, orden } = await searchParams;
  const admin = createAdminClient();
  const isSuper = (await getAdminRole()) === "super_admin";
  // Solicitudes de la más reciente a la más antigua (equipo, 11-ago), con
  // filtro para invertir el orden (Fase 4)
  const masAntiguos = orden === "antiguos";
  const { data } = await admin
    .from("ambassadors")
    .select(
      "id, first_name, last_name, email, phone, curp, city, state, referral_code, status, user_id, created_at, bank_name, clabe, bank_holder, ine_front_url, ine_back_url, birth_date, rfc, motivation, social_links, deactivation_reason, deactivated_at, tipo_persona, razon_social, referrals(commission_amount, status, created_at)",
    )
    .order("created_at", { ascending: masAntiguos });

  const rows = ((data ?? []) as Row[]).filter(
    (a) => !estado || a.status === estado,
  );

  // Ligas de INE FIRMADAS (13-ago): el bucket `ine-documents` es privado, así
  // que lo que se guarda es la ruta y la liga hay que firmarla al pintar. Las
  // filas heredadas traían la URL pública completa y daban 400 al abrirlas —
  // `ligaFirmadaDeIne` entiende las dos formas.
  const ineFirmadas = new Map<string, { frente: string | null; reverso: string | null }>(
    await Promise.all(
      rows.map(
        async (a) =>
          [
            a.id,
            {
              frente: await ligaFirmadaDeIne(a.ine_front_url),
              reverso: await ligaFirmadaDeIne(a.ine_back_url),
            },
          ] as const,
      ),
    ),
  );
  // El expediente de cada solicitud: cada documento con su estado propio
  // (decisión 1.5). Se firma aquí, como la INE, porque los buckets son
  // privados.
  const expedientes = new Map<string, DocumentoFirmado[]>(
    await Promise.all(
      rows.map(
        async (a) =>
          [a.id, await documentosDeSolicitud({ ambassadorId: a.id })] as const,
      ),
    ),
  );

  const pending = rows.filter((a) => a.status === "pending");
  const approved = rows.filter((a) => a.status === "approved");
  const canceled = ((data ?? []) as Row[]).filter(
    (a) => a.status === "canceled",
  );

  // Filtro de período para los referidos (equipo, 5-ago): cuántos trajo cada
  // embajador entre dos fechas. Las fechas vienen como YYYY-MM-DD.
  const periodo =
    desde || hasta
      ? {
          desde: desde ? new Date(`${desde}T00:00:00-06:00`) : null,
          hasta: hasta ? new Date(`${hasta}T23:59:59-06:00`) : null,
        }
      : null;
  const referidosEnPeriodo = (a: Row) =>
    a.referrals.filter((r) => {
      const t = new Date(r.created_at);
      if (periodo?.desde && t < periodo.desde) return false;
      if (periodo?.hasta && t > periodo.hasta) return false;
      return true;
    }).length;

  // Medianoche de México: las comisiones del mes se cortan con el calendario del
  // negocio, no con el del servidor.
  const monthStart = inicioDelMes();

  const stats = (a: Row) => {
    // A quien se dio de baja se le paga hasta SU fecha de baja (Pablo, 16-ago):
    // cuenta la membresía cobrada antes de que dejara de ser embajadora, no la
    // que entró después. Mismo filtro que `payAmbassadorCut` y que el layout
    // del banco — si los tres no coinciden, el panel promete un monto que el
    // botón de pagar no liquida.
    const corteBaja = a.deactivated_at ? new Date(a.deactivated_at) : null;
    const payable = a.referrals.filter(
      (r) =>
        r.status === "pending" &&
        new Date(r.created_at) < monthStart &&
        (!corteBaja || new Date(r.created_at) <= corteBaja),
    );
    return {
      count: a.referrals.length,
      historic: a.referrals.reduce(
        (s, r) => s + Number(r.commission_amount ?? 0),
        0,
      ),
      payable: payable.reduce(
        (s, r) => s + Number(r.commission_amount ?? 0),
        0,
      ),
      payableCount: payable.length,
    };
  };

  const withCut = approved
    .map((a) => ({ a, s: stats(a) }))
    .filter(({ s }) => s.payableCount > 0);

  const fullName = (a: Row) =>
    `${a.first_name}${a.last_name ? ` ${a.last_name}` : ""}`;

  // Qué le falta a la solicitud/perfil del embajador (Fase 4: en todos los
  // popups). Banco/CLABE y RFC no bloquean la aprobación, pero sin ellos no
  // se le puede pagar el corte — por eso se marcan.
  const faltantesEmbajador = (a: Row) =>
    [
      (!a.ine_front_url || !a.ine_back_url) && "INE (frente y reverso)",
      !a.birth_date && "fecha de nacimiento",
      (!a.bank_name || !a.clabe) && "banco y CLABE para su pago",
      !a.rfc && "RFC",
      !Object.values(a.social_links ?? {}).some(Boolean) &&
        "al menos una red social",
    ].filter(Boolean) as string[];

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <h1 className="font-display text-[26px] text-ink-title">Embajadores</h1>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <FilterChips
          basePath="/admin/embajadores"
          current={estado}
          keep={{ desde, hasta, orden }}
          allLabel="Todos"
          options={[
            { value: "pending", label: "Pendientes" },
            { value: "approved", label: "Aprobados" },
            { value: "rejected", label: "Denegados" },
            ...(isSuper ? [{ value: "canceled", label: "🕊️ Bajas" }] : []),
          ]}
        />
        <FilterChips
          basePath="/admin/embajadores"
          current={orden}
          param="orden"
          keep={{ estado, desde, hasta }}
          allLabel="Más recientes"
          options={[{ value: "antiguos", label: "Más antiguos" }]}
        />
        {/* Rango de fechas para contar referidos por período (equipo, 5-ago) */}
        <form
          action="/admin/embajadores"
          className="flex flex-wrap items-center gap-2 text-[12px] text-ink-secondary"
        >
          {estado && <input type="hidden" name="estado" value={estado} />}
          {orden && <input type="hidden" name="orden" value={orden} />}
          <label className="flex items-center gap-1.5">
            Referidos del
            <input
              type="date"
              name="desde"
              defaultValue={desde}
              className="h-9 rounded-full border-[1.5px] border-border-input bg-white px-3 text-[12px] text-ink-title outline-none focus:border-teal"
            />
          </label>
          <label className="flex items-center gap-1.5">
            al
            <input
              type="date"
              name="hasta"
              defaultValue={hasta}
              className="h-9 rounded-full border-[1.5px] border-border-input bg-white px-3 text-[12px] text-ink-title outline-none focus:border-teal"
            />
          </label>
          <button
            type="submit"
            className="grid h-9 place-items-center rounded-full bg-teal px-4 text-[12px] font-bold text-white transition-colors hover:bg-teal-deep"
          >
            Aplicar
          </button>
        </form>
      </div>

      <h2 className="font-display text-lg text-ink-title">
        Solicitudes por revisar
      </h2>
      <div className="flex flex-col gap-2.5">
        {pending.map((a) => (
          <AmbassadorReviewRow
            key={a.id}
            ambassador={{
              id: a.id,
              name: fullName(a),
              email: a.email,
              phone: a.phone,
              curp: a.curp,
              location: [a.city, a.state].filter(Boolean).join(", "),
              hasAccount: Boolean(a.user_id),
              applied: formatDateEs(new Date(a.created_at)),
            }}
            detailSlot={
              <DetailModal title={`Solicitud de ${fullName(a)}`}>
                <div className="flex flex-col gap-4">
                  {faltantesEmbajador(a).length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-warning-bg px-3 py-1.5 text-[11.5px] font-bold text-warning-text">
                        ⚠ Falta: {faltantesEmbajador(a).join(" · ")}
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                    <DetailItem
                      label="TIPO DE PERSONA"
                      value={
                        a.tipo_persona === "moral"
                          ? "Moral (empresa)"
                          : "Física"
                      }
                    />
                    {a.tipo_persona === "moral" && (
                      <DetailItem label="RAZÓN SOCIAL" value={a.razon_social} />
                    )}
                    <DetailItem
                      label={
                        a.tipo_persona === "moral"
                          ? "REPRESENTANTE LEGAL"
                          : "NOMBRE"
                      }
                      value={fullName(a)}
                    />
                    <DetailItem label="CORREO" value={a.email} />
                    <DetailItem label="TELÉFONO" value={a.phone} />
                    <DetailItem label="CURP" value={a.curp} />
                    <DetailItem
                      label="FECHA DE NACIMIENTO"
                      value={
                        a.birth_date
                          ? formatDateEs(new Date(a.birth_date + "T12:00:00"))
                          : null
                      }
                    />
                    <DetailItem label="CIUDAD" value={a.city} />
                    <DetailItem label="ESTADO" value={a.state} />
                    <DetailItem
                      label="CUENTA VINCULADA"
                      value={a.user_id ? "Sí ✓" : "Aún no crea cuenta"}
                    />
                    <DetailItem
                      label="SOLICITÓ"
                      value={formatDateEs(new Date(a.created_at))}
                    />
                  </div>
                  {a.motivation && (
                    <p className="rounded-[10px] bg-cream px-3 py-2 text-[12.5px] italic text-ink-secondary">
                      «{a.motivation}»
                    </p>
                  )}
                  {/* EL EXPEDIENTE, EN EL POPUP DONDE SE APRUEBA. Antes aquí
                      colgaban solo las dos ligas de la INE (13-ago). Desde el
                      19-ago cada documento trae su propio estado y sus botones,
                      porque la revisión es documento por documento y con
                      persona moral hay más de una identificación que mirar. */}
                  <ExpedienteDocumentos
                    documentos={expedientes.get(a.id) ?? []}
                    faltantes={documentosRequeridos(
                      (a.tipo_persona ?? "fisica") as TipoPersona,
                    )
                      .filter(
                        (t) =>
                          !(expedientes.get(a.id) ?? []).some(
                            (d) => d.document_type === t,
                          ),
                      )
                      .map((t) => ETIQUETA_DOCUMENTO[t] ?? t)}
                  />
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                      REDES SOCIALES
                    </span>
                    <SocialLinks links={a.social_links} />
                  </div>
                  {/* Resolver sin salir del popup (equipo, 5-ago) */}
                  <div className="border-t border-border-divider pt-3">
                    <AmbassadorResolveButtons ambassadorId={a.id} />
                  </div>
                </div>
              </DetailModal>
            }
          />
        ))}
        {pending.length === 0 && (
          <div className="rounded-[18px] bg-white p-6 text-sm text-ink-secondary shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            Sin solicitudes pendientes. 🎉
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg text-ink-title">
          Corte mensual{" "}
          <span className="text-sm font-normal text-ink-tertiary">
            (pago el día {AMBASSADOR_PAYOUT_DAY})
          </span>
        </h2>
        {withCut.length > 0 && (
          <a
            href="/api/admin/layouts/comisiones"
            className="grid h-9 place-items-center rounded-full border-[1.5px] border-teal px-4 text-xs font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
          >
            ⬇ Descargar layout bancario (CSV)
          </a>
        )}
      </div>
      <div className="flex flex-col rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        {withCut.length > 0 ? (
          withCut.map(({ a, s }) => (
            <div
              key={a.id}
              className="flex items-center gap-3 border-b border-[#F2EEE4] py-2.5 last:border-0"
            >
              <span className="flex-1 text-[13px] text-ink-body">
                <strong className="text-ink-title">{fullName(a)}</strong> ·{" "}
                {a.referral_code} · {s.payableCount} referido
                {s.payableCount === 1 ? "" : "s"} por pagar
              </span>
              <span className="text-sm font-bold text-teal-deep">
                {formatMxn(s.payable)} MXN
              </span>
              <PayCutButton ambassadorId={a.id} />
            </div>
          ))
        ) : (
          <p className="text-sm text-ink-secondary">
            No hay comisiones pendientes de corte. Los referidos del mes en
            curso entran al corte del próximo mes.
          </p>
        )}
      </div>

      <h2 className="font-display text-lg text-ink-title">
        Embajadores activos
      </h2>
      <div className="flex flex-col overflow-x-auto rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
        {approved.length > 0 ? (
          <>
            <div
              className={`grid min-w-[560px] gap-2 border-b-[1.5px] border-[#F2EEE4] pb-1.5 text-[10.5px] font-extrabold tracking-[.05em] text-ink-placeholder ${
                periodo
                  ? "grid-cols-[1fr_150px_90px_110px_110px]"
                  : "grid-cols-[1fr_150px_90px_110px]"
              }`}
            >
              <span>EMBAJADOR</span>
              <span>CÓDIGO</span>
              <span>REFERIDOS</span>
              {periodo && <span>EN PERÍODO</span>}
              <span>HISTÓRICO</span>
            </div>
            {approved.map((a) => {
              const s = stats(a);
              return (
                <DetailModal
                  key={a.id}
                  title={`Embajador: ${fullName(a)}`}
                  trigger={
                    <div
                      className={`grid min-w-[560px] items-center gap-2 border-b border-[#F2EEE4] px-1 py-2.5 text-[13px] text-ink-body ${
                        periodo
                          ? "grid-cols-[1fr_150px_90px_110px_110px]"
                          : "grid-cols-[1fr_150px_90px_110px]"
                      }`}
                    >
                      <span className="truncate">
                        <strong className="text-ink-title">{fullName(a)}</strong>
                        <span className="text-ink-tertiary"> · {a.email}</span>
                      </span>
                      <span className="font-semibold text-teal-deep">
                        {a.referral_code}
                      </span>
                      <span>{s.count}</span>
                      {periodo && (
                        <span className="font-bold text-teal-deep">
                          {referidosEnPeriodo(a)}
                        </span>
                      )}
                      <span className="font-bold text-ink-title">
                        {formatMxn(s.historic)} MXN
                      </span>
                    </div>
                  }
                >
                  <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                      <DetailItem label="NOMBRE" value={fullName(a)} />
                      <DetailItem label="CORREO" value={a.email} />
                      <DetailItem label="TELÉFONO" value={a.phone} />
                      <DetailItem
                        label="UBICACIÓN"
                        value={[a.city, a.state].filter(Boolean).join(", ")}
                      />
                      <DetailItem label="CÓDIGO" value={a.referral_code} />
                      <DetailItem
                        label="CUENTA VINCULADA"
                        value={a.user_id ? "Sí ✓" : "Aún no crea cuenta"}
                      />
                      <DetailItem
                        label="EMBAJADOR DESDE"
                        value={formatDateEs(new Date(a.created_at))}
                      />
                    </div>

                    <div className="flex flex-col gap-2.5 rounded-[12px] bg-cream p-3.5">
                      <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                        REFERIDOS Y COMISIONES
                      </span>
                      <div className="grid grid-cols-3 gap-x-4 gap-y-2.5">
                        <DetailItem label="REFERIDOS" value={String(s.count)} />
                        <DetailItem
                          label="HISTÓRICO"
                          value={`${formatMxn(s.historic)} MXN`}
                        />
                        <DetailItem
                          label="POR PAGAR (CORTE)"
                          value={`${formatMxn(s.payable)} MXN`}
                        />
                      </div>
                    </div>

                    {a.motivation && (
                      <p className="rounded-[10px] bg-cream px-3 py-2 text-[12.5px] italic text-ink-secondary">
                        «{a.motivation}»
                      </p>
                    )}
                    {faltantesEmbajador(a).length > 0 && (
                      <span className="self-start rounded-full bg-warning-bg px-3 py-1.5 text-[11.5px] font-bold text-warning-text">
                        ⚠ Falta: {faltantesEmbajador(a).join(" · ")}
                      </span>
                    )}
                    <div className="flex flex-col gap-1.5">
                      <span className="text-[10.5px] font-extrabold tracking-[.05em] text-ink-tertiary">
                        REDES SOCIALES
                      </span>
                      <SocialLinks links={a.social_links} />
                    </div>

                    <SensitiveBlock isSuper={isSuper}>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                        <DetailItem label="CURP" value={a.curp} />
                        <DetailItem
                          label="FECHA DE NACIMIENTO"
                          value={
                            a.birth_date
                              ? formatDateEs(new Date(a.birth_date + "T12:00:00"))
                              : null
                          }
                        />
                        <DetailItem
                          label="TIPO DE PERSONA"
                          value={
                            a.tipo_persona === "moral"
                              ? "Moral (empresa)"
                              : "Física"
                          }
                        />
                        {a.tipo_persona === "moral" && (
                          <DetailItem
                            label="RAZÓN SOCIAL"
                            value={a.razon_social}
                          />
                        )}
                        <DetailItem label="RFC" value={a.rfc} />
                        <DetailItem label="BANCO" value={a.bank_name} />
                        <DetailItem label="CLABE" value={a.clabe} />
                        <DetailItem label="TITULAR DE LA CUENTA" value={a.bank_holder} />
                        <DetailItem
                          label="INE"
                          value={
                            a.ine_front_url || a.ine_back_url ? (
                              <LigasIne
                                firmadas={ineFirmadas.get(a.id)}
                                guardado={{
                                  frente: a.ine_front_url,
                                  reverso: a.ine_back_url,
                                }}
                              />
                            ) : null
                          }
                        />
                      </div>
                    </SensitiveBlock>

                    <ExpedienteDocumentos
                      documentos={expedientes.get(a.id) ?? []}
                      faltantes={documentosRequeridos(
                        (a.tipo_persona ?? "fisica") as TipoPersona,
                      )
                        .filter(
                          (t) =>
                            !(expedientes.get(a.id) ?? []).some(
                              (d) => d.document_type === t,
                            ),
                        )
                        .map((t) => ETIQUETA_DOCUMENTO[t] ?? t)}
                    />

                    {/* Tablero dinámico por embajador (equipo, 5-ago) */}
                    <a
                      href={`/admin/embajadores/${a.id}`}
                      className="self-start text-[13px] font-bold text-teal-deep hover:underline"
                    >
                      📊 Ver tablero de referidos y pagos →
                    </a>

                    {isSuper && (
                      <div className="border-t border-border-divider pt-3">
                        <AmbassadorDeactivateButton
                          ambassadorId={a.id}
                          name={fullName(a)}
                        />
                      </div>
                    )}
                  </div>
                </DetailModal>
              );
            })}
          </>
        ) : (
          <p className="text-sm text-ink-secondary">
            Aún no hay embajadores aprobados.
          </p>
        )}
      </div>

      {/* Bajas (super admin) — con su motivo (equipo, 5-ago) */}
      {isSuper && estado === "canceled" && (
        <>
          <h2 className="font-display text-lg text-ink-title">
            Dados de baja
          </h2>
          <div className="flex flex-col rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
            {canceled.length > 0 ? (
              canceled.map((a) => {
                // Darse de baja NO borra lo ya ganado: al confirmar la baja se
                // le promete que sus comisiones se pagan en el siguiente corte
                // (equipo, 5-ago). Antes esa promesa no tenía cómo cumplirse —
                // el layout del banco los excluía y aquí no había botón, así
                // que los referidos se quedaban en "pendiente" para siempre.
                const s = stats(a);
                return (
                  <div
                    key={a.id}
                    className="flex flex-wrap items-center gap-3 border-b border-[#F2EEE4] py-2.5 text-[13px] text-ink-body last:border-0"
                  >
                    <span className="min-w-0 flex-1">
                      <strong className="text-ink-title">{fullName(a)}</strong> ·{" "}
                      {a.email}
                      {a.referral_code ? ` · ${a.referral_code}` : ""}
                    </span>
                    {s.payableCount > 0 && (
                      <span className="rounded-full bg-warning-bg px-2.5 py-1 text-[10.5px] font-extrabold text-warning-text">
                        DEBE COBRAR {formatMxn(s.payable)} · {s.payableCount}{" "}
                        {s.payableCount === 1 ? "referido" : "referidos"}
                      </span>
                    )}
                    <span className="rounded-full bg-cream px-2.5 py-1 text-[10.5px] font-extrabold text-ink-tertiary">
                      🕊️ BAJA{a.deactivation_reason ? ` · ${a.deactivation_reason}` : ""}
                    </span>
                    {s.payableCount > 0 && <PayCutButton ambassadorId={a.id} />}
                  </div>
                );
              })
            ) : (
              <p className="text-sm text-ink-secondary">
                Sin embajadores dados de baja.
              </p>
            )}
          </div>
        </>
      )}
    </div>
  );
}
