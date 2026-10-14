"use client";

import { useState } from "react";
import { subscribeNewsletter } from "@/app/actions";

export function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done" | "error">(
    "idle",
  );
  const [mensaje, setMensaje] = useState("");

  const submit = async () => {
    setState("busy");
    const result = await subscribeNewsletter(email);
    setMensaje(result.error ?? "");
    setState(result.error ? "error" : "done");
  };

  if (state === "done") {
    return (
      <p className="text-sm font-semibold text-lime">
        ¡Listo! Ya eres parte de la manada informada. 🐾
      </p>
    );
  }

  return (
    <form
      className="flex flex-col gap-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex gap-2">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Tu correo"
          className="h-11 min-w-0 flex-1 rounded-full border-[1.5px] border-white/25 bg-white/10 px-4 text-sm text-white outline-none placeholder:text-white/50 focus:border-lime"
        />
        <button
          type="submit"
          disabled={state === "busy"}
          className="grid h-11 place-items-center rounded-full bg-lime px-5 text-[13px] font-extrabold text-teal-dark transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {state === "busy" ? "Enviando…" : "Enviar"}
        </button>
      </div>
      {state === "error" && (
        <span className="text-xs font-semibold text-[#FFB3C4]">
          {mensaje || "Revisa tu correo e intenta de nuevo."}
        </span>
      )}
      <span className="text-xs leading-relaxed text-white/60">
        Te enviaremos novedades, consejos y noticias que te harán mover la
        cola. 🐾
      </span>
    </form>
  );
}
