"use client";

const SITIO =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.pataamiga.mx";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  renderTemplate,
  EMAIL_CATEGORIES,
  TEMPLATE_CATEGORY,
} from "@/lib/email/templates";
import { saveEmailTemplate, resetEmailTemplate } from "@/app/admin/actions";

export type EditableTemplate = {
  key: string;
  name: string;
  description: string;
  variables: Record<string, string>;
  sample: Record<string, string>;
  subject: string;
  html: string;
  isCustom: boolean;
};

export function EmailTemplatesEditor({
  templates,
}: {
  templates: EditableTemplate[];
}) {
  const router = useRouter();
  const [selectedKey, setSelectedKey] = useState(templates[0]?.key);
  const [drafts, setDrafts] = useState<
    Record<string, { subject: string; html: string }>
  >({});
  const [pending, startTransition] = useTransition();
  const [notice, setNotice] = useState<string | null>(null);

  const selected = templates.find((t) => t.key === selectedKey);

  // Agrupar plantillas por categoría (en el orden de EMAIL_CATEGORIES)
  const grouped = useMemo(
    () =>
      EMAIL_CATEGORIES.map((cat) => ({
        ...cat,
        items: templates.filter((t) => TEMPLATE_CATEGORY[t.key] === cat.id),
      })).filter((c) => c.items.length > 0),
    [templates],
  );

  // Categoría abierta: por defecto la que contiene la plantilla seleccionada
  const [openCat, setOpenCat] = useState<string | null>(
    () => TEMPLATE_CATEGORY[templates[0]?.key ?? ""] ?? null,
  );
  // El borrador va en su propio useMemo: sin él, cuando todavía no hay cambios
  // guardados se creaba un objeto nuevo en CADA render, y eso hacía que el
  // useMemo de la vista previa de abajo se recalculara siempre (o sea, no
  // memorizaba nada).
  const draft = useMemo(
    () =>
      selected
        ? (drafts[selected.key] ?? {
            subject: selected.subject,
            html: selected.html,
          })
        : null,
    [selected, drafts],
  );

  const preview = useMemo(() => {
    if (!selected || !draft) return { subject: "", html: "" };
    // `siteUrl` la inyecta el envío en TODOS los correos; aquí se repite para
    // que los botones de la vista previa no salgan con la liga vacía.
    const vars = { siteUrl: SITIO, ...selected.sample };
    return {
      subject: renderTemplate(draft.subject, vars),
      html: renderTemplate(draft.html, vars),
    };
  }, [selected, draft]);

  if (!selected || !draft) return null;

  const dirty =
    draft.subject !== selected.subject || draft.html !== selected.html;

  const patch = (p: Partial<{ subject: string; html: string }>) =>
    setDrafts((prev) => ({
      ...prev,
      [selected.key]: { ...draft, ...p },
    }));

  const save = () =>
    startTransition(async () => {
      setNotice(null);
      const result = await saveEmailTemplate(
        selected.key,
        draft.subject,
        draft.html,
      );
      if (result?.error) setNotice(result.error);
      else {
        setNotice("Plantilla guardada — los próximos correos usarán esta versión.");
        router.refresh();
      }
    });

  const reset = () =>
    startTransition(async () => {
      setNotice(null);
      await resetEmailTemplate(selected.key);
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[selected.key];
        return next;
      });
      setNotice("Se restauró la versión por defecto.");
      router.refresh();
    });

  return (
    <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
      {/* Template list — agrupado por categoría (acordeón) */}
      <div className="flex flex-col gap-1.5">
        {grouped.map((cat) => {
          const isOpen = openCat === cat.id;
          const editedCount = cat.items.filter((t) => t.isCustom).length;
          return (
            <div key={cat.id} className="flex flex-col">
              <button
                type="button"
                onClick={() => setOpenCat(isOpen ? null : cat.id)}
                className={`flex items-center justify-between rounded-[12px] px-3.5 py-2.5 text-left text-[13px] font-bold transition-colors ${
                  isOpen ? "text-teal-deep" : "text-ink-title hover:bg-white/60"
                }`}
                aria-expanded={isOpen}
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden>{cat.icon}</span>
                  {cat.label}
                  <span className="rounded-full bg-cream px-1.5 py-0.5 text-[10px] font-extrabold text-ink-tertiary">
                    {cat.items.length}
                  </span>
                  {editedCount > 0 && (
                    <span className="size-1.5 rounded-full bg-orange" title={`${editedCount} editada(s)`} />
                  )}
                </span>
                <span aria-hidden className="text-ink-tertiary">{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                <div className="mt-0.5 flex flex-col gap-1 pl-2">
                  {cat.items.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => {
                        setSelectedKey(t.key);
                        setNotice(null);
                      }}
                      className={`flex items-center justify-between rounded-[10px] px-3 py-2 text-left text-[12.5px] ${
                        t.key === selectedKey
                          ? "bg-white font-bold text-teal-deep shadow-[0_2px_10px_rgba(30,83,80,.05)]"
                          : "font-semibold text-ink-secondary hover:bg-white/60"
                      }`}
                    >
                      <span className="truncate">{t.name}</span>
                      {t.isCustom && (
                        <span className="ml-2 flex-none rounded-full bg-warning-bg px-2 py-0.5 text-[9px] font-extrabold text-warning-text">
                          EDITADA
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Editor + preview */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-4 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <div className="flex flex-col gap-0.5">
            <span className="text-sm font-bold text-ink-title">
              {selected.name}
            </span>
            <span className="text-xs text-ink-tertiary">
              {selected.description}
            </span>
          </div>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink-title">
              Asunto
            </span>
            <input
              value={draft.subject}
              onChange={(e) => patch({ subject: e.target.value })}
              className="h-11 rounded-[12px] border-[1.5px] border-border-input px-3.5 text-sm text-ink-title outline-none focus:border-teal"
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-ink-title">
              Cuerpo (HTML)
            </span>
            <textarea
              value={draft.html}
              onChange={(e) => patch({ html: e.target.value })}
              rows={10}
              spellCheck={false}
              className="rounded-[12px] border-[1.5px] border-border-input p-3.5 font-mono text-xs leading-relaxed text-ink-body outline-none focus:border-teal"
            />
          </label>

          <div className="rounded-[12px] bg-cream px-4 py-3 text-xs leading-relaxed text-ink-secondary">
            <strong className="text-ink-title">Variables disponibles: </strong>
            <span>
              <code className="font-bold text-teal-deep">{"{{siteUrl}}"}</code>{" "}
              dirección del sitio, disponible en todas las plantillas ·{" "}
            </span>
            {Object.entries(selected.variables).map(([name, desc], i) => (
              <span key={name}>
                {i > 0 && " · "}
                <code className="font-bold text-teal-deep">{`{{${name}}}`}</code>{" "}
                {desc}
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={save}
              disabled={pending || !dirty}
              className="grid h-10 place-items-center rounded-full bg-teal px-5 text-[13px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
            >
              {pending ? "Guardando…" : "Guardar cambios"}
            </button>
            {selected.isCustom && (
              <button
                type="button"
                onClick={reset}
                disabled={pending}
                className="grid h-10 place-items-center rounded-full border-[1.5px] border-border-input px-5 text-[13px] font-semibold text-ink-secondary transition-colors hover:border-teal hover:text-teal-deep disabled:opacity-50"
              >
                Restaurar versión por defecto
              </button>
            )}
            {notice && (
              <span className="text-xs font-semibold text-success-text">
                {notice}
              </span>
            )}
          </div>
        </div>

        {/* Live preview with sample data */}
        <div className="flex flex-col gap-2.5 rounded-[18px] bg-white p-5 shadow-[0_2px_10px_rgba(30,83,80,.05)]">
          <span className="text-[11px] font-extrabold tracking-[.06em] text-ink-tertiary">
            VISTA PREVIA (CON DATOS DE EJEMPLO)
          </span>
          <div className="rounded-[12px] border-[1.5px] border-border-divider px-4 py-2.5 text-sm">
            <span className="text-ink-tertiary">Asunto: </span>
            <strong className="text-ink-title">{preview.subject}</strong>
          </div>
          <iframe
            title="Vista previa del correo"
            srcDoc={`<body style="margin:16px">${preview.html}</body>`}
            sandbox=""
            className="h-[320px] w-full rounded-[12px] border-[1.5px] border-border-divider bg-white"
          />
        </div>
      </div>
    </div>
  );
}
