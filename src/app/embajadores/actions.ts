"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "@/lib/email/send";
import { notifyTeam } from "@/lib/alerts";
import { validateCurp } from "@/lib/curp";

export type AmbassadorApplicationInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  curp: string;
  state: string;
  /** Alcaldía o municipio, según el caso — una sola variable (equipo, 11-ago). */
  city: string;
  isAdult: boolean;
  /** Apellido materno (equipo, 11-ago). */
  secondLastName?: string;
  /** CP de 5 dígitos: autocompleta colonia y alcaldía/municipio. */
  postalCode?: string;
  colony?: string;
  /**
   * Redes sociales: al menos una es OBLIGATORIA (equipo, 11-ago) — es como el
   * comité valora el alcance real de quien solicita.
   */
  socialLinks?: Record<string, string>;
  /** yyyy-mm-dd — lo captura el propio solicitante (equipo, 5-ago) */
  birthDate?: string;
  /** Por qué quiere ser embajador (equipo, 5-ago) */
  motivation?: string;
  /**
   * Contraseña de la cuenta que se crea AL APLICAR (equipo, 11-ago).
   * Antes no se pedía: la solicitud se guardaba sin cuenta, así que el
   * solicitante no podía entrar a su portal ni recuperar su contraseña
   * (no existía usuario que recuperar). Solo es opcional cuando ya hay
   * sesión iniciada, porque entonces la cuenta ya existe.
   */
  password?: string;
};

/** Solicitud pública de embajador → cola de revisión del comité (CURP, 18+). */
export async function registerAmbassador(input: AmbassadorApplicationInput) {
  const firstName = input.firstName?.trim();
  const lastName = input.lastName?.trim();
  const email = input.email?.trim().toLowerCase();
  const phone = input.phone?.trim();
  const curp = input.curp?.trim().toUpperCase();

  if (!firstName || !email || !phone)
    return { error: "Completa tu nombre, correo y teléfono." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: "Revisa el correo electrónico." };
  if (!input.isAdult)
    return { error: "El programa de embajadores es para mayores de edad." };
  // Validación completa (formato + dígito verificador) — regla del sitio vivo
  const curpCheck = validateCurp(curp ?? "");
  if (!curpCheck.isValid)
    return { error: curpCheck.error ?? "Revisa tu CURP (18 caracteres, formato oficial)." };

  // Al menos una red social. Se limpia antes de validar para que un campo con
  // espacios no cuente como red llenada.
  const socialLinks = Object.fromEntries(
    Object.entries(input.socialLinks ?? {})
      .map(([k, v]) => [k, (v ?? "").trim()])
      .filter(([, v]) => v.length > 0),
  );
  if (Object.keys(socialLinks).length === 0)
    return {
      error:
        "Agrega al menos una red social (Facebook, Instagram, TikTok o YouTube).",
    };

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("ambassadors")
    .select("id, status")
    .eq("email", email)
    .in("status", ["pending", "approved"])
    .maybeSingle();
  if (existing) {
    return {
      error:
        existing.status === "pending"
          ? "Ya tenemos una solicitud en revisión con ese correo. El comité te contactará pronto."
          : "Ese correo ya pertenece a un embajador activo. Inicia sesión para ver tu dashboard.",
    };
  }

  // Link the application to the signed-in account when there is one, so the
  // dashboard opens automatically after approval.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: mine } = await admin
      .from("ambassadors")
      .select("id, status")
      .eq("user_id", user.id)
      .in("status", ["pending", "approved"])
      .limit(1)
      .maybeSingle();
    if (mine) {
      return {
        error:
          mine.status === "pending"
            ? "Tu cuenta ya tiene una solicitud en revisión. El comité te contactará pronto."
            : "Tu cuenta ya es de un embajador activo — entra a tu dashboard en /embajador.",
      };
    }
  }

  // ===== Cuenta al aplicar (equipo, 11-ago) =====
  // Sin sesión previa creamos la cuenta AQUÍ, con la contraseña que eligió el
  // solicitante. Antes la solicitud nacía sin `user_id` y esa persona quedaba
  // sin forma de entrar: su "recuperar contraseña" no mandaba nada porque
  // Supabase no revela si el correo existe, y no existía.
  let ambassadorUserId = user?.id ?? null;

  if (!ambassadorUserId) {
    const password = input.password ?? "";
    if (password.length < 8)
      return { error: "Tu contraseña debe tener al menos 8 caracteres." };

    // ¿Ese correo ya tiene cuenta? No la ligamos en automático: sería
    // apropiarse de la cuenta de alguien más con solo escribir su correo.
    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (existingProfile) {
      return {
        error:
          "Ese correo ya tiene una cuenta en Pata Amiga. Inicia sesión y vuelve a enviar tu solicitud desde ahí.",
      };
    }

    const { data: created, error: createError } =
      await admin.auth.admin.createUser({
        email,
        password,
        // Confirmado de entrada: el equipo pidió que la verificación de correo
        // no trabe el avance. El filtro real es la revisión del comité.
        email_confirm: true,
        user_metadata: { phone, first_name: firstName },
      });
    if (createError || !created?.user) {
      await notifyTeam(
        "notify_ambassadors",
        "Falló crear la cuenta de un embajador ⚠️",
        `<p>No se pudo crear la cuenta de <strong>${email}</strong> al enviar su solicitud.</p>
         <p>${createError?.message ?? "sin detalle"}</p>`,
      );
      return { error: "No pudimos crear tu cuenta. Intenta de nuevo." };
    }
    ambassadorUserId = created.user.id;
  }

  const birthDate = input.birthDate?.trim();
  const { error } = await admin.from("ambassadors").insert({
    user_id: ambassadorUserId,
    first_name: firstName,
    last_name: lastName || null,
    second_last_name: input.secondLastName?.trim() || null,
    email,
    phone,
    curp,
    state: input.state?.trim() || null,
    city: input.city?.trim() || null,
    postal_code: input.postalCode?.trim() || null,
    colony: input.colony?.trim() || null,
    social_links: socialLinks,
    birth_date:
      birthDate && /^\d{4}-\d{2}-\d{2}$/.test(birthDate) ? birthDate : null,
    motivation: input.motivation?.trim() || null,
    status: "pending",
  });
  if (error) {
    // Si la cuenta se creó en esta misma llamada y la solicitud no se guardó,
    // la borramos: si no, ese correo queda "ocupado" por una cuenta huérfana y
    // la persona no puede volver a aplicar.
    if (!user && ambassadorUserId)
      await admin.auth.admin.deleteUser(ambassadorUserId);
    return { error: "No pudimos guardar tu solicitud. Intenta de nuevo." };
  }

  await sendTemplatedEmail("ambassador_received", email, { firstName });
  await notifyTeam(
    "notify_ambassadors",
    "Nueva solicitud de embajador 🤝",
    `<h2 style="color:#1E5350">Nueva solicitud de embajador</h2>
     <p><strong>${firstName} ${lastName ?? ""}</strong> (${email}) quiere unirse al programa.</p>
     <p>Revisa la cola en el panel → Embajadores.</p>`,
  );

  return { ok: true as const };
}
