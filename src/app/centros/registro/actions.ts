"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendTemplatedEmail } from "@/lib/email/send";
import { notifyTeam } from "@/lib/alerts";
import { WELLNESS_SERVICES } from "@/lib/constants";
import { validateCurp } from "@/lib/curp";
import { EDAD_MINIMA, esMayorDeEdad, fechaDeNacimientoDeCurp } from "@/lib/edad";
import { esRfcDeMoral } from "@/lib/rfc";
import { esDocumentoValido, guardarFotoIne } from "@/lib/documentos-ine";
import {
  guardarDocumentoDeSolicitud,
  type TipoPersona,
} from "@/lib/documentos-solicitud";

export type CenterLocationInput = {
  address: string;
  postalCode: string;
  colony: string;
  city: string;
  state: string;
  phone?: string;
};

export type CenterRegistrationInput = {
  name: string;
  contactName: string;
  email: string;
  phone: string;
  website?: string;
  /** Redes del centro, cada una en su campo (equipo, 15-ago). */
  socialLinks?: Record<string, string>;
  services: string[];
  memberBenefit: string;
  locations: CenterLocationInput[];
  /**
   * Contraseña de la cuenta que se crea AL APLICAR (equipo, 11-ago).
   * Antes la solicitud se guardaba sin cuenta: el centro no podía entrar a su
   * perfil mientras estaba en revisión, y su "recuperar contraseña" no mandaba
   * nada porque no existía usuario que recuperar. Solo es opcional cuando ya
   * hay sesión iniciada.
   */
  password?: string;
  /**
   * Persona física o moral (equipo, 19-ago — decisiones 1.1 a 1.3).
   *
   * En una persona MORAL, `contactName`, `curp` e `ineFront/Back` son los del
   * REPRESENTANTE LEGAL; la entidad viaja en `razonSocial` y `rfc`.
   */
  tipoPersona?: TipoPersona;
  razonSocial?: string;
  rfc?: string;
  /** Constancia de situación fiscal, como data URL. NO se pide acta constitutiva. */
  rfcConstancia?: string;
  /**
   * CURP e INE de quien registra. NUEVOS en el alta de centro: hasta el 19-ago
   * no se pedía ningún documento, así que se validaba a quien comparte un
   * código y no al negocio que publicamos y al que mandamos miembros.
   */
  curp?: string;
  ineFront?: string;
  ineBack?: string;
};

const VALID_SERVICES = new Set(Object.keys(WELLNESS_SERVICES));

/** Solicitud pública de centro aliado → cola de revisión del comité. */
export async function registerCenter(input: CenterRegistrationInput) {
  const name = input.name?.trim();
  const contactName = input.contactName?.trim();
  const email = input.email?.trim().toLowerCase();
  const phone = input.phone?.trim();
  const memberBenefit = input.memberBenefit?.trim();
  const services = (input.services ?? []).filter((s) => VALID_SERVICES.has(s));
  const locations = (input.locations ?? [])
    .map((l) => ({
      address: l.address?.trim(),
      postal_code: l.postalCode?.trim(),
      colony: l.colony?.trim() || null,
      city: l.city?.trim() || null,
      state: l.state?.trim() || null,
      phone: l.phone?.trim() || null,
    }))
    .filter((l) => l.address);

  if (!name || !contactName || !email || !phone)
    return { error: "Completa los datos de contacto del centro." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return { error: "Revisa el correo electrónico." };
  if (services.length === 0)
    return { error: "Selecciona al menos un servicio." };
  if (!memberBenefit)
    return { error: "Cuéntanos el beneficio que ofrecerás a los miembros." };
  if (locations.length === 0)
    return { error: "Agrega al menos una ubicación con dirección." };

  // ===== Identidad de quien registra (equipo, 19-ago) =====
  // Se comprueba en el servidor y no solo en el formulario: basta con alterar
  // la petición para saltarse cualquier regla del navegador.
  const esMoral = input.tipoPersona === "moral";
  const curp = input.curp?.trim().toUpperCase() ?? "";
  const curpCheck = validateCurp(curp);
  if (!curpCheck.isValid)
    return {
      error:
        curpCheck.error ?? "Revisa la CURP (18 caracteres, formato oficial).",
    };

  const birthDate = fechaDeNacimientoDeCurp(curp);
  if (!birthDate)
    return { error: "No pudimos leer la fecha de nacimiento de la CURP." };
  if (!esMayorDeEdad(birthDate))
    return {
      error: esMoral
        ? `La CURP del representante legal indica que aún no cumple ${EDAD_MINIMA} años.`
        : `La CURP indica que aún no cumples ${EDAD_MINIMA} años. Quien registra el centro tiene que ser mayor de edad.`,
    };

  if (!esDocumentoValido(input.ineFront) || !esDocumentoValido(input.ineBack))
    return {
      error: esMoral
        ? "Falta la INE del representante legal. Necesitamos los dos lados —frente y reverso— en foto o PDF."
        : "Falta tu INE. Necesitamos los dos lados —frente y reverso— en foto o PDF.",
    };

  const razonSocial = input.razonSocial?.trim() ?? "";
  const rfc = input.rfc?.trim().toUpperCase() ?? "";
  if (esMoral) {
    if (!razonSocial) return { error: "Escribe la razón social de la empresa." };
    if (!esRfcDeMoral(rfc))
      return {
        error:
          "Revisa el RFC de la empresa: son 12 caracteres. Uno de 13 es el de una persona física.",
      };
    if (!esDocumentoValido(input.rfcConstancia))
      return { error: "Falta la constancia de situación fiscal de la empresa." };
  }

  const admin = createAdminClient();

  // One pending/approved application per email keeps the queue clean
  const { data: existing } = await admin
    .from("wellness_centers")
    .select("id, status")
    .eq("email", email)
    .in("status", ["pending", "approved"])
    .maybeSingle();
  if (existing) {
    return {
      error:
        existing.status === "pending"
          ? "Ya tenemos una solicitud en revisión con ese correo. El comité te contactará pronto."
          : "Ese correo ya pertenece a un centro aliado. Escríbenos si necesitas actualizar tus datos.",
    };
  }

  // Con sesión iniciada, el centro queda ligado a esa cuenta. Sin sesión, la
  // cuenta se CREA aquí mismo (equipo, 11-ago) para que el centro pueda entrar
  // a su perfil aunque el comité aún no resuelva.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // …pero solo si el correo del formulario ES el de esa sesión.
  //
  // Antes, con sesión abierta se ligaba la solicitud a la cuenta de la sesión
  // SIN MIRAR el correo escrito: el correo y la contraseña del formulario se
  // ignoraban en silencio y no nacía cuenta para ese correo. Así fue como un
  // centro capturado desde la sesión del comité quedó colgado de la cuenta del
  // comité, y "recuperar contraseña" con el correo del formulario no mandaba
  // nada — esa cuenta nunca existió (reporte de la PM, 12-ago).
  if (user && (user.email ?? "").toLowerCase() !== email) {
    return {
      error: `Tienes la sesión abierta con ${user.email}. Para registrar el centro con ${email}, cierra sesión y vuelve a enviar la solicitud; si el centro es de esta cuenta, usa ${user.email} en el formulario.`,
    };
  }

  if (user) {
    const { data: mine } = await admin
      .from("wellness_centers")
      .select("id, status")
      .eq("user_id", user.id)
      .in("status", ["pending", "approved"])
      .limit(1)
      .maybeSingle();
    if (mine) {
      return {
        error:
          mine.status === "pending"
            ? "Tu cuenta ya tiene una solicitud de centro en revisión. El comité te contactará pronto."
            : "Tu cuenta ya es de un centro aliado — entra a tu dashboard en /centro.",
      };
    }
  }

  // ===== Cuenta al aplicar (equipo, 11-ago) =====
  let centerUserId = user?.id ?? null;

  if (!centerUserId) {
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
        // Confirmado de entrada: la verificación de correo no debe trabar el
        // acceso al perfil. El filtro real es la revisión del comité.
        email_confirm: true,
        user_metadata: { phone, first_name: contactName },
      });
    if (createError || !created?.user) {
      await notifyTeam(
        "notify_centers",
        "Falló crear la cuenta de un centro ⚠️",
        `<p>No se pudo crear la cuenta de <strong>${email}</strong> al enviar su solicitud.</p>
         <p>${createError?.message ?? "sin detalle"}</p>`,
      );
      return { error: "No pudimos crear tu cuenta. Intenta de nuevo." };
    }
    centerUserId = created.user.id;
  }

  /** Deshace la cuenta recién creada si la solicitud no llega a guardarse. */
  const rollbackAccount = async () => {
    if (!user && centerUserId) await admin.auth.admin.deleteUser(centerUserId);
  };

  // La INE se sube AHORA, con la cuenta ya creada: el bucket es privado y su
  // ruta arranca con el id del usuario, que hasta este punto no existía.
  const [ineFrontPath, ineBackPath] = await Promise.all([
    guardarFotoIne(centerUserId, "ine_front", input.ineFront ?? ""),
    guardarFotoIne(centerUserId, "ine_back", input.ineBack ?? ""),
  ]);

  const { data: center, error } = await admin
    .from("wellness_centers")
    .insert({
      user_id: centerUserId,
      tipo_persona: esMoral ? "moral" : "fisica",
      razon_social: esMoral ? razonSocial : null,
      rfc: esMoral ? rfc : null,
      curp,
      birth_date: birthDate,
      name,
      contact_name: contactName,
      email,
      phone,
      website: input.website?.trim() || null,
      // Se normalizan igual que las del embajador: sin vacíos y con https://
      // adelante, para que la tarjeta del directorio pueda enlazarlas.
      social_links: Object.fromEntries(
        Object.entries(input.socialLinks ?? {})
          .map(([k, v]) => [k, (v ?? "").trim()])
          .filter(([, v]) => v.length > 0)
          .map(([k, v]) => [k, v.startsWith("http") ? v : `https://${v}`]),
      ),
      services,
      member_benefit: memberBenefit,
      status: "pending",
    })
    .select("id")
    .single();
  if (error || !center) {
    await rollbackAccount();
    return { error: "No pudimos guardar tu solicitud. Intenta de nuevo." };
  }

  const { error: locError } = await admin
    .from("wellness_center_locations")
    .insert(locations.map((l) => ({ ...l, center_id: center.id })));
  if (locError) {
    await admin.from("wellness_centers").delete().eq("id", center.id);
    await rollbackAccount();
    return { error: "No pudimos guardar las ubicaciones. Intenta de nuevo." };
  }

  // El expediente: cada documento como su renglón, para la revisión documento
  // por documento del panel (decisión 1.5).
  const anotar = async (
    tipo: "ine_front" | "ine_back",
    ruta: string | null,
  ) => {
    if (!ruta) return;
    await admin.from("documents").insert({
      user_id: centerUserId,
      center_id: center.id,
      document_type: tipo,
      file_path: ruta,
      file_name: tipo === "ine_front" ? "INE (frente)" : "INE (reverso)",
      status: "pendiente",
    });
  };
  await anotar("ine_front", ineFrontPath);
  await anotar("ine_back", ineBackPath);

  if (esMoral) {
    const constancia = await guardarDocumentoDeSolicitud({
      userId: centerUserId,
      tipo: "rfc_constancia",
      dataUrl: input.rfcConstancia ?? "",
      centerId: center.id,
    });
    // No se tumba el alta por esto: la solicitud ya está guardada y perderla
    // sería peor. Se avisa al equipo para que la pida por la conversación.
    if (!constancia)
      await notifyTeam(
        "notify_centers",
        "No se guardó la constancia fiscal de un centro ⚠️",
        `<p>La solicitud de <strong>${razonSocial}</strong> (${email}) se guardó, pero su constancia de situación fiscal no.</p>
         <p>Hay que pedírsela desde el panel.</p>`,
      );
  }

  await sendTemplatedEmail("center_received", email, {
    contactName,
    centerName: name,
  });
  await notifyTeam(
    "notify_centers",
    "Nueva solicitud de centro aliado 📍",
    `<h2 style="color:#1E5350">Nueva solicitud de centro aliado</h2>
     <p><strong>${name}</strong> — contacto: ${contactName} (${email}).</p>
     <p>Revisa la cola en el panel → Centros.</p>`,
  );

  return { ok: true as const };
}
