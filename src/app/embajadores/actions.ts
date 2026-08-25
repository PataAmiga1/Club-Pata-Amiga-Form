"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "@/lib/email/send";
import { notifyTeam } from "@/lib/alerts";
import { validateCurp } from "@/lib/curp";
import {
  EDAD_MINIMA,
  esMayorDeEdad,
  fechaDeNacimientoDeCurp,
} from "@/lib/edad";
import { esDocumentoValido, guardarFotoIne } from "@/lib/documentos-ine";
import { esRfcDeMoral } from "@/lib/rfc";
import {
  guardarDocumentoDeSolicitud,
  type TipoPersona,
} from "@/lib/documentos-solicitud";

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
  /**
   * CP de 5 dígitos — lo ÚNICO que se pide del domicilio (Pablo, 19-ago).
   * Sirve para saber en qué zonas está la manada; ciudad y estado llegan
   * derivados de él, no tecleados.
   */
  postalCode?: string;
  /**
   * Redes sociales: al menos una es OBLIGATORIA (equipo, 11-ago) — es como el
   * comité valora el alcance real de quien solicita.
   */
  socialLinks?: Record<string, string>;
  /** Por qué quiere ser embajador (equipo, 5-ago) */
  motivation?: string;
  /**
   * INE por los DOS lados, como data URL de imagen ya comprimida en el
   * navegador (equipo, 13-ago). Obligatorias: el comité valida identidad con
   * ellas y las comisiones se pagan a nombre de esa persona.
   */
  ineFront?: string;
  ineBack?: string;
  /**
   * Contraseña de la cuenta que se crea AL APLICAR (equipo, 11-ago).
   * Antes no se pedía: la solicitud se guardaba sin cuenta, así que el
   * solicitante no podía entrar a su portal ni recuperar su contraseña
   * (no existía usuario que recuperar). Solo es opcional cuando ya hay
   * sesión iniciada, porque entonces la cuenta ya existe.
   */
  password?: string;
  /**
   * Persona física o moral (equipo, 19-ago — decisiones 1.1 a 1.3).
   *
   * En una persona MORAL, `firstName`, `lastName`, `curp` e `ineFront/Back` son
   * los del REPRESENTANTE LEGAL, no los de la entidad: la entidad viaja en
   * `razonSocial` y `rfc`. Es la misma información que el formulario ya pedía,
   * así que se reusan los mismos campos en vez de duplicar media solicitud.
   */
  tipoPersona?: TipoPersona;
  razonSocial?: string;
  rfc?: string;
  /** Constancia de situación fiscal, como data URL. NO se pide acta constitutiva. */
  rfcConstancia?: string;
};

/** Solicitud pública de embajador → cola de revisión del comité (CURP, 18+). */
export async function registerAmbassador(input: AmbassadorApplicationInput) {
  const firstName = input.firstName?.trim();
  const lastName = input.lastName?.trim();
  const email = input.email?.trim().toLowerCase();
  const phone = input.phone?.trim();
  const curp = input.curp?.trim().toUpperCase();

  const esMoral = input.tipoPersona === "moral";

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

  // 18+ DE VERDAD (equipo, 13-ago), ahora SOLO desde la CURP (Pablo, 19-ago).
  //
  // Antes se pedían las dos cosas —la fecha tecleada y la CURP— y se validaban
  // ambas. Sobraba: la CURP es obligatoria aquí y su formato ya se comprobó
  // arriba, así que la fecha va dentro. Quien escribía una fecha falsa de
  // adulto quedaba fuera igual por la CURP, o sea que el campo tecleado no
  // aportaba seguridad, solo un paso más. Mismo criterio que el alta de
  // miembro del 16-ago.
  //
  // Se calcula en el servidor a propósito: si viniera del navegador, bastaría
  // con alterar la petición para saltarse la regla.
  const birthDate = fechaDeNacimientoDeCurp(curp ?? "");
  if (!birthDate)
    return {
      error: "No pudimos leer tu fecha de nacimiento de la CURP. Revísala.",
    };
  if (!esMayorDeEdad(birthDate))
    return {
      error: esMoral
        ? `La CURP del representante legal indica que aún no cumple ${EDAD_MINIMA} años. Tiene que ser mayor de edad.`
        : `Tu CURP indica que aún no cumples ${EDAD_MINIMA} años. El programa de embajadores es para mayores de edad.`,
    };

  // INE por los dos lados, obligatoria (equipo, 13-ago). Se valida aquí y no
  // solo en el formulario: sin ella el comité no puede aprobar a nadie. En una
  // persona moral es la del representante legal (decisión 1.2).
  if (!esDocumentoValido(input.ineFront) || !esDocumentoValido(input.ineBack))
    return {
      error: esMoral
        ? "Falta la INE del representante legal. Necesitamos los dos lados —frente y reverso— en foto o PDF."
        : "Falta tu INE. Necesitamos los dos lados —frente y reverso— en foto o PDF.",
    };

  // Persona moral: razón social + RFC de la ENTIDAD + su constancia. Se
  // comprueba en el servidor y no solo en el formulario, porque basta con
  // alterar la petición para saltarse cualquier regla del navegador.
  const razonSocial = input.razonSocial?.trim() ?? "";
  const rfc = input.rfc?.trim().toUpperCase() ?? "";
  if (esMoral) {
    if (!razonSocial)
      return { error: "Escribe la razón social de la empresa." };
    if (!esRfcDeMoral(rfc))
      return {
        error:
          "Revisa el RFC de la empresa: son 12 caracteres. Uno de 13 es el de una persona física.",
      };
    if (!esDocumentoValido(input.rfcConstancia))
      return {
        error: "Falta la constancia de situación fiscal de la empresa.",
      };
  }

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

  // Solo si el correo del formulario ES el de la sesión. Con otro correo, la
  // solicitud se colgaba de la cuenta abierta y el correo/contraseña escritos
  // se ignoraban: no nacía cuenta para ese correo y su "recuperar contraseña"
  // no mandaba nada (mismo caso que se detectó en centros, 12-ago).
  if (user && (user.email ?? "").toLowerCase() !== email) {
    return {
      error: `Tienes la sesión abierta con ${user.email}. Para enviar la solicitud con ${email}, cierra sesión y vuelve a intentarlo; si la solicitud es de esta cuenta, usa ${user.email} en el formulario.`,
    };
  }

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

  // La INE se sube AHORA, con la cuenta ya creada: el bucket es privado y su
  // ruta arranca con el id del usuario, que hasta este punto no existía.
  const [ineFrontPath, ineBackPath] = await Promise.all([
    guardarFotoIne(ambassadorUserId, "ine_front", input.ineFront ?? ""),
    guardarFotoIne(ambassadorUserId, "ine_back", input.ineBack ?? ""),
  ]);

  const { data: solicitud, error } = await admin
    .from("ambassadors")
    .insert({
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
      social_links: socialLinks,
      // Derivada de la CURP, no tecleada. La columna se conserva porque el panel
      // la muestra y el corte de comisiones puede necesitar la edad.
      birth_date: birthDate,
      motivation: input.motivation?.trim() || null,
      ine_front_url: ineFrontPath,
      ine_back_url: ineBackPath,
      tipo_persona: esMoral ? "moral" : "fisica",
      razon_social: esMoral ? razonSocial : null,
      ...(esMoral ? { rfc } : {}),
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !solicitud) {
    // Si la cuenta se creó en esta misma llamada y la solicitud no se guardó,
    // la borramos: si no, ese correo queda "ocupado" por una cuenta huérfana y
    // la persona no puede volver a aplicar.
    if (!user && ambassadorUserId)
      await admin.auth.admin.deleteUser(ambassadorUserId);
    return { error: "No pudimos guardar tu solicitud. Intenta de nuevo." };
  }

  // El expediente: cada documento como su propio renglón, para que el comité
  // los revise uno por uno (decisión 1.5). La INE además se queda en sus dos
  // columnas de siempre, que es de donde la leen el panel y el portal.
  const enExpediente = async (
    tipo: "ine_front" | "ine_back" | "rfc_constancia",
    ruta: string | null,
    dataUrl?: string,
  ) => {
    if (tipo === "rfc_constancia") {
      return guardarDocumentoDeSolicitud({
        userId: ambassadorUserId!,
        tipo,
        dataUrl: dataUrl ?? "",
        ambassadorId: solicitud.id,
      });
    }
    // La INE ya está en Storage: aquí solo se anota en el expediente.
    if (!ruta) return null;
    await admin.from("documents").insert({
      user_id: ambassadorUserId,
      ambassador_id: solicitud.id,
      document_type: tipo,
      file_path: ruta,
      file_name: tipo === "ine_front" ? "INE (frente)" : "INE (reverso)",
      status: "pendiente",
    });
    return ruta;
  };

  await enExpediente("ine_front", ineFrontPath);
  await enExpediente("ine_back", ineBackPath);
  if (esMoral) {
    const constancia = await enExpediente(
      "rfc_constancia",
      null,
      input.rfcConstancia,
    );
    // No se tumba el alta por esto: la solicitud ya está guardada y perderla
    // sería peor. Se avisa al equipo para que la pida por la conversación.
    if (!constancia)
      await notifyTeam(
        "notify_ambassadors",
        "No se guardó la constancia fiscal de un embajador ⚠️",
        `<p>La solicitud de <strong>${razonSocial}</strong> (${email}) se guardó, pero su constancia de situación fiscal no.</p>
         <p>Hay que pedírsela desde el panel.</p>`,
      );
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
