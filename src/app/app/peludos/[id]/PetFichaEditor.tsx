"use client";

/* eslint-disable @next/next/no-img-element */
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TextField, SelectField } from "@/components/ui/Field";
import { AutocompleteField } from "@/components/ui/AutocompleteField";
import { Button } from "@/components/ui/Button";
import { PET_GALLERY_MAX, SENIOR_PET_AGE_YEARS } from "@/lib/constants";
import { DOG_BREED_NAMES, CAT_BREED_NAMES } from "@/data/pet-catalogs";
import { updatePetFicha, replyPetThread, deactivatePet } from "./actions";

export type PetFicha = {
  id: string;
  userId: string;
  name: string;
  species: "dog" | "cat";
  breed: string | null;
  isSenior: boolean;
  infoRequested: boolean;
  sex: string | null;
  coatColor: string | null;
  noseColor: string | null;
  eyeColor: string | null;
  isAdopted: boolean;
  adoptionStory: string | null;
  photoUrl: string | null;
  galleryPhotos: string[];
  vetCertificateUrl: string | null;
  active: boolean;
};

export type ThreadMessage = {
  id: string;
  sender: "admin" | "member";
  message: string;
  requested_items: string[];
  created_at: string;
};

const REQUEST_LABELS: Record<string, string> = {
  foto_principal: "📸 Foto principal",
  certificado: "🏥 Certificado veterinario",
  documento: "📄 Documento adicional",
};

/** Ficha completa: foto principal + galería (máx. 5) + datos + hilo con el comité. */
export function PetFichaEditor({
  pet,
  thread,
}: {
  pet: PetFicha;
  thread: ThreadMessage[];
}) {
  const router = useRouter();
  const mainRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const certRef = useRef<HTMLInputElement>(null);

  const [photoUrl, setPhotoUrl] = useState(pet.photoUrl);
  const [gallery, setGallery] = useState<string[]>(pet.galleryPhotos);
  const [certUrl, setCertUrl] = useState(pet.vetCertificateUrl);
  const [breed, setBreed] = useState(pet.breed ?? "");
  const [sex, setSex] = useState(pet.sex ?? "");
  const [coat, setCoat] = useState(pet.coatColor ?? "");
  const [nose, setNose] = useState(pet.noseColor ?? "");
  const [eye, setEye] = useState(pet.eyeColor ?? "");
  const [adopted, setAdopted] = useState(pet.isAdopted);
  const [story, setStory] = useState(pet.adoptionStory ?? "");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bajaOpen, setBajaOpen] = useState(false);
  const [bajaReason, setBajaReason] = useState("");
  const [bajaDetails, setBajaDetails] = useState("");

  // El hilo con el comité solo existe para el miembro cuando el comité ya
  // escribió (nota del cliente): sin mensajes de admin, la sección se oculta.
  const showThread =
    pet.infoRequested || thread.some((m) => m.sender === "admin");

  async function upload(file: File): Promise<string | null> {
    const supabase = createClient();
    const path = `${pet.userId}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage
      .from("pet-photos")
      .upload(path, file);
    if (upErr) return null;
    return supabase.storage.from("pet-photos").getPublicUrl(path).data.publicUrl;
  }

  const save = async (patch: Parameters<typeof updatePetFicha>[1] = {}) => {
    setBusy("save");
    setError(null);
    setNotice(null);
    try {
      const result = await updatePetFicha(pet.id, {
        breed,
        sex,
        coatColor: coat,
        noseColor: nose,
        eyeColor: eye,
        isAdopted: adopted,
        adoptionStory: story,
        photoUrl: photoUrl ?? undefined,
        galleryPhotos: gallery,
        vetCertificateUrl: certUrl ?? undefined,
        ...patch,
      });
      if (result.error) setError(result.error);
      else setNotice("Ficha guardada ✓");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Aviso: el comité pidió información */}
      {pet.infoRequested && (
        <div className="rounded-[14px] bg-info-bg px-4 py-3 text-[13.5px] font-semibold leading-relaxed text-info-text">
          💬 El comité te pidió información sobre {pet.name} — revisa el
          mensaje abajo, actualiza lo necesario en la ficha y respóndeles.
        </div>
      )}

      {/* Fotos */}
      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)]">
        <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
          FOTOS
        </span>
        <div className="flex flex-wrap items-start gap-3">
          {/* Foto principal */}
          <button
            type="button"
            onClick={() => mainRef.current?.click()}
            disabled={busy === "main"}
            className="relative grid size-[104px] flex-none place-items-center overflow-hidden rounded-[18px] border-2 border-teal bg-[#F2FAF9] text-[24px] text-teal"
            title="Foto principal — toca para cambiarla"
          >
            {photoUrl ? (
              // Absoluta: height 100% en fila auto de grid se resuelve como
              // auto y la foto muestra la franja superior en vez del centro
              <img src={photoUrl} alt={pet.name} className="absolute inset-0 size-full object-cover" />
            ) : (
              "+"
            )}
            <span className="absolute bottom-0 inset-x-0 bg-teal py-0.5 text-[9px] font-extrabold text-white">
              PRINCIPAL
            </span>
          </button>
          <input
            ref={mainRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy("main");
              const url = await upload(f);
              setBusy(null);
              if (url) {
                setPhotoUrl(url);
                await save({ photoUrl: url });
              }
            }}
          />
          {/* Galería */}
          {gallery.map((url, i) => (
            <div key={url} className="relative size-[104px] flex-none overflow-hidden rounded-[18px]">
              <img src={url} alt={`${pet.name} ${i + 1}`} className="size-full object-cover" />
              <button
                type="button"
                aria-label="Quitar foto"
                onClick={async () => {
                  const next = gallery.filter((g) => g !== url);
                  setGallery(next);
                  await save({ galleryPhotos: next });
                }}
                className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-white/90 text-xs font-bold text-error-text"
              >
                ✕
              </button>
            </div>
          ))}
          {gallery.length < PET_GALLERY_MAX && (
            <button
              type="button"
              onClick={() => galleryRef.current?.click()}
              disabled={busy === "gallery"}
              className="grid size-[104px] flex-none place-items-center rounded-[18px] border-2 border-dashed border-[#C9E9E4] bg-[#F2FAF9] text-[22px] text-teal"
              title="Agregar foto a la galería"
            >
              {busy === "gallery" ? "…" : "+"}
            </button>
          )}
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy("gallery");
              const url = await upload(f);
              setBusy(null);
              if (url) {
                const next = [...gallery, url].slice(0, PET_GALLERY_MAX);
                setGallery(next);
                await save({ galleryPhotos: next });
              }
            }}
          />
        </div>
        <span className="text-xs text-ink-tertiary">
          1 foto principal + hasta {PET_GALLERY_MAX} fotos de galería.
        </span>
      </section>

      {/* Datos */}
      <section className="flex flex-col gap-4 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)]">
        <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
          DATOS DE {pet.name.toUpperCase()}
        </span>
        <div className="grid gap-3.5 sm:grid-cols-2">
          {/* La raza se pide AQUÍ desde el 12-ago: el alta quedó en tres datos
              (tipo, nombre y edad) y todo lo demás se completa ya pagado. Sin
              este campo no habría dónde capturarla nunca. */}
          <AutocompleteField
            label="Raza"
            options={
              pet.species === "dog"
                ? ["Mestizo", ...DOG_BREED_NAMES]
                : ["Doméstico", ...CAT_BREED_NAMES]
            }
            value={breed}
            onChange={setBreed}
            placeholder={pet.species === "dog" ? "Mestizo, Labrador…" : "Doméstico, Siamés…"}
            hint="Escribe y elige una sugerencia. Si no aparece, escríbela tal cual."
          />
          <SelectField label="Sexo" value={sex} onChange={(e) => setSex(e.target.value)}>
            <option value="">Elige</option>
            <option value="male">Macho</option>
            <option value="female">Hembra</option>
          </SelectField>
          <TextField
            label="Color de pelaje"
            placeholder="Ej. Café con blanco"
            value={coat}
            onChange={(e) => setCoat(e.target.value)}
          />
          <TextField
            label="Color de ojos"
            placeholder="Ej. Miel"
            value={eye}
            onChange={(e) => setEye(e.target.value)}
          />
          <TextField
            label="Color de nariz/trufa"
            placeholder="Ej. Negra"
            value={nose}
            onChange={(e) => setNose(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2.5 text-[13.5px] font-semibold text-ink-title">
          <input
            type="checkbox"
            checked={adopted}
            onChange={(e) => setAdopted(e.target.checked)}
            className="size-4 accent-[#1CBCAD]"
          />
          Es adoptado 💚
        </label>
        {adopted && (
          <textarea
            value={story}
            onChange={(e) => setStory(e.target.value)}
            rows={2}
            placeholder="Cuéntanos su historia de adopción (opcional)…"
            className="rounded-[12px] border-[1.5px] border-border-input p-3 text-sm text-ink-body outline-none focus:border-teal"
          />
        )}

        {pet.isSenior && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] bg-warning-bg px-4 py-3">
            <span className="text-[13px] font-semibold text-warning-text">
              {certUrl
                ? "Certificado veterinario recibido ✓"
                : `${pet.name} es senior (${SENIOR_PET_AGE_YEARS}+): sube su certificado veterinario`}
            </span>
            <button
              type="button"
              onClick={() => certRef.current?.click()}
              className="rounded-full border-[1.5px] border-warning-text px-4 py-1.5 text-xs font-bold text-warning-text"
            >
              {busy === "cert" ? "Subiendo…" : certUrl ? "Reemplazar" : "Subir certificado"}
            </button>
            <input
              ref={certRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                setBusy("cert");
                const url = await upload(f);
                setBusy(null);
                if (url) {
                  setCertUrl(url);
                  await save({ vetCertificateUrl: url });
                }
              }}
            />
          </div>
        )}

        {error && (
          <span className="text-sm font-semibold text-error-text">{error}</span>
        )}
        <div className="flex items-center gap-3">
          <Button type="button" onClick={() => save()} disabled={busy === "save"}>
            {busy === "save" ? "Guardando…" : "Guardar ficha"}
          </Button>
          {notice && (
            <span className="text-sm font-semibold text-success-text">{notice}</span>
          )}
        </div>
      </section>

      {/* Hilo con el comité — visible solo cuando el comité ya escribió */}
      {showThread && (
      <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)]">
        <span className="text-[13px] font-extrabold tracking-[.06em] text-teal-deep">
          MENSAJES CON EL COMITÉ
        </span>
        <div className="flex max-h-[320px] flex-col gap-2 overflow-y-auto">
          {thread.map((m) => (
            <div
              key={m.id}
              className={`flex max-w-[85%] flex-col gap-1 rounded-[14px] px-3.5 py-2.5 text-[13px] leading-relaxed ${
                m.sender === "admin"
                  ? "self-start bg-cream text-ink-body"
                  : "self-end bg-info-bg text-ink-body"
              }`}
            >
              <span className="text-[10px] font-extrabold tracking-wide text-ink-tertiary">
                {m.sender === "admin" ? "COMITÉ PATA AMIGA" : "TÚ"} ·{" "}
                {new Intl.DateTimeFormat("es-MX", {
                  day: "numeric",
                  month: "short",
                  hour: "2-digit",
                  minute: "2-digit",
                }).format(new Date(m.created_at))}
              </span>
              {m.requested_items.length > 0 && (
                <span className="flex flex-wrap gap-1">
                  {m.requested_items.map((it) => (
                    <span
                      key={it}
                      className="rounded-full bg-warning-bg px-2 py-0.5 text-[10.5px] font-bold text-warning-text"
                    >
                      {REQUEST_LABELS[it] ?? it}
                    </span>
                  ))}
                </span>
              )}
              {m.message}
            </div>
          ))}
          {thread.length === 0 && (
            <span className="py-2 text-[13px] text-ink-secondary">
              Sin mensajes por ahora. Si el comité necesita algo sobre{" "}
              {pet.name}, te escribirá aquí (y te avisamos por correo).
            </span>
          )}
        </div>
        <form
          className="flex items-end gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!reply.trim()) return;
            setBusy("reply");
            const result = await replyPetThread(pet.id, reply);
            setBusy(null);
            if (!result.error) {
              setReply("");
              router.refresh();
            } else setError(result.error);
          }}
        >
          <textarea
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            rows={2}
            placeholder="Escribe tu respuesta al comité…"
            className="min-w-0 flex-1 rounded-[12px] border-[1.5px] border-border-input p-3 text-sm text-ink-body outline-none focus:border-teal"
          />
          <button
            type="submit"
            disabled={busy === "reply" || !reply.trim()}
            className="grid h-11 flex-none place-items-center rounded-full bg-teal px-5 text-[13px] font-bold text-white transition-colors hover:bg-teal-deep disabled:opacity-50"
          >
            {busy === "reply" ? "Enviando…" : "Enviar"}
          </button>
        </form>
      </section>
      )}

      {/* Dar de baja — la tarjeta queda como recuerdo y libera su lugar */}
      {pet.active && (
        <section className="flex flex-col gap-3 rounded-[20px] bg-white p-5 shadow-[var(--shadow-card)]">
          <span className="text-[13px] font-extrabold tracking-[.06em] text-ink-tertiary">
            DAR DE BAJA A {pet.name.toUpperCase()}
          </span>
          {!bajaOpen ? (
            <button
              type="button"
              onClick={() => setBajaOpen(true)}
              className="self-start rounded-full border-[1.5px] border-border-input px-4 py-2 text-[12.5px] font-bold text-ink-secondary transition-colors hover:border-error-text hover:text-error-text"
            >
              Dar de baja…
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-[13px] leading-relaxed text-ink-secondary">
                Su tarjeta se quedará contigo como recuerdo y su lugar se
                libera para otro peludo (el nuevo entra como reemplazo, con
                período de espera de 180 días).
              </p>
              <SelectField
                label="¿Por qué lo das de baja?"
                value={bajaReason}
                onChange={(e) => setBajaReason(e.target.value)}
              >
                <option value="">Elige un motivo</option>
                <option value="fallecio">Falleció 🕊️</option>
                <option value="ya_no_esta">Ya no vive conmigo</option>
                <option value="otro">Otro motivo</option>
              </SelectField>
              <textarea
                value={bajaDetails}
                onChange={(e) => setBajaDetails(e.target.value)}
                rows={2}
                placeholder="Cuéntanos un poco más (opcional)…"
                className="rounded-[12px] border-[1.5px] border-border-input p-3 text-sm text-ink-body outline-none focus:border-teal"
              />
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setBajaOpen(false)}
                  className="rounded-full border-[1.5px] border-border-input px-4 py-2 text-[12.5px] font-bold text-ink-secondary"
                >
                  Conservarlo
                </button>
                <button
                  type="button"
                  disabled={busy === "baja" || !bajaReason}
                  onClick={async () => {
                    setBusy("baja");
                    setError(null);
                    const result = await deactivatePet(pet.id, bajaReason, bajaDetails);
                    setBusy(null);
                    if (result.error) setError(result.error);
                    else window.location.assign("/app/peludos");
                  }}
                  className="rounded-full bg-error-bg px-4 py-2 text-[12.5px] font-bold text-error-text transition-opacity hover:opacity-80 disabled:opacity-50"
                >
                  {busy === "baja" ? "Procesando…" : "Confirmar baja"}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
