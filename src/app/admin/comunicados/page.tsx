import { createAdminClient } from "@/lib/supabase/admin";
import { EMAIL_TEMPLATES } from "@/lib/email/templates";
import {
  EmailTemplatesEditor,
  type EditableTemplate,
} from "./EmailTemplatesEditor";

export default async function AdminComunicadosPage() {
  const admin = createAdminClient();
  const { data: overrides } = await admin
    .from("email_templates")
    .select("key, subject, html");
  const byKey = Object.fromEntries((overrides ?? []).map((o) => [o.key, o]));

  const templates: EditableTemplate[] = EMAIL_TEMPLATES.map((t) => {
    const override = byKey[t.key];
    return {
      key: t.key,
      name: t.name,
      description: t.description,
      variables: t.variables,
      sample: t.sample,
      subject: override?.subject ?? t.subject,
      html: override?.html ?? t.html,
      isCustom: Boolean(override),
    };
  });

  return (
    <div className="flex flex-col gap-5 px-5 py-6 md:px-[30px] md:py-[26px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-[26px] text-ink-title">
            Comunicados
          </h1>
          <p className="max-w-[620px] text-sm text-ink-secondary">
            Los correos que la plataforma envía automáticamente. Edita el
            asunto o el cuerpo y guarda — los próximos envíos usarán tu
            versión. Las variables entre llaves se llenan solas con los datos
            de cada caso.
          </p>
        </div>
        {/* Envíos dirigidos y extraordinarios (equipo, 5-ago) */}
        <a
          href="/admin/comunicados/envios"
          className="grid h-10 place-items-center rounded-full border-[1.5px] border-teal px-5 text-[12.5px] font-bold text-teal-deep transition-colors hover:bg-teal hover:text-white"
        >
          ✉️ Envíos dirigidos →
        </a>
      </div>
      <EmailTemplatesEditor templates={templates} />
    </div>
  );
}
