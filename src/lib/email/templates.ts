/**
 * Registro de correos transaccionales. Cada plantilla tiene una versión por
 * defecto aquí; el comité puede sobreescribir asunto/cuerpo desde
 * /admin/comunicados (tabla email_templates). Las variables se escriben
 * {{asi}} y se sustituyen al enviar.
 *
 * Terminología VINCULANTE (CLAUDE.md): reintegro, tiempo de espera,
 * orientación veterinaria 24/7 — nunca seguro, póliza, cobertura, carencia.
 */

export type EmailTemplateDef = {
  key: string;
  name: string;
  description: string;
  /** Variables disponibles y qué contienen (para el editor del admin). */
  variables: Record<string, string>;
  /** Datos de muestra para la vista previa del editor. */
  sample: Record<string, string>;
  subject: string;
  html: string;
};

const FOOTER = `<p style="margin:0;color:#6B7C79;font-size:13px">Pata Amiga · El mejor cuidado para tu manada</p>`;

/**
 * Logo para correos (los clientes de correo no soportan SVG).
 *
 * Se sirve del propio sitio (`public/brand/`), NO del storage de Supabase:
 * antes apuntaba al proyecto de desarrollo, así que pausar ese proyecto
 * rompía el logo de correos que producción ya manda (hallazgo 7-ago).
 * La URL es absoluta y del dominio de producción a propósito: las plantillas
 * de Auth de Supabase son las mismas en staging y producción.
 */
const EMAIL_HEADER_IMG = "https://www.pataamiga.mx/brand/email-header.png";

/**
 * Cascarón brandeado de TODOS los correos transaccionales (Fase 5: "que
 * todos los correos vayan con la marca"). Antes era un <div> pelón sin logo
 * ni tarjeta — el correo de la campaña sí iba brandeado y el resto no. Solo
 * tablas + estilos inline (Gmail/Outlook no soportan flexbox ni <style>),
 * 600px, mismo encabezado teal con logo que el correo de campaña.
 */
const WRAP = (inner: string) =>
  `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF7F1;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">
      <tr><td style="background-color:#1CBCAD;border-radius:20px 20px 0 0;padding:22px 20px;text-align:center;">
        <img src="${EMAIL_HEADER_IMG}" width="170" alt="Club Pata Amiga" style="display:inline-block;width:170px;max-width:60%;height:auto;border-radius:12px;">
      </td></tr>
      <tr><td style="background-color:#FFFFFF;padding:30px 32px 22px;color:#3D524F;font-size:15px;line-height:1.65;">${inner}</td></tr>
      <tr><td style="background-color:#FFFFFF;border-radius:0 0 20px 20px;border-top:1px solid #F2EEE4;padding:16px 32px;text-align:center;">${FOOTER}</td></tr>
    </table>
  </td></tr>
</table>`;

/**
 * Correo brandeado de la campaña de regalo — HTML apto para clientes de
 * correo: solo tablas + estilos inline (Gmail/Outlook no soportan flexbox
 * ni hojas de estilo). Ancho 600px, botones a prueba de balas.
 */
const CAMPAIGN_GIFT_HTML = `<!-- Correo "Obtén tu regalo" · Club Pata Amiga -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF7F1;padding:24px 12px;font-family:Arial,Helvetica,sans-serif;">
  <tr><td align="center">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

      <!-- Encabezado con logo sobre teal -->
      <tr><td style="background-color:#1CBCAD;border-radius:20px 20px 0 0;padding:26px 20px;text-align:center;">
        <img src="${EMAIL_HEADER_IMG}" width="180" alt="Club Pata Amiga" style="display:inline-block;width:180px;max-width:60%;height:auto;border-radius:12px;">
      </td></tr>

      <!-- Cuerpo -->
      <tr><td style="background-color:#FFFFFF;padding:34px 32px 10px;">
        <h1 style="margin:0 0 12px;font-size:26px;line-height:1.25;color:#1E5350;">¡Tu regalo está aquí, {{firstName}}! 🎁</h1>
        <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#3D524F;">Gracias por registrarte. Esto es lo que preparamos para ti y tu peludo:</p>
        {{couponBlock}}
        {{pdfBlock}}
      </td></tr>

      <!-- Por qué unirte -->
      <tr><td style="background-color:#FFFFFF;padding:6px 32px 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#FAF7F1;border-radius:16px;">
          <tr><td style="padding:18px 22px;">
            <p style="margin:0 0 10px;font-size:14px;font-weight:bold;color:#1E5350;">Usa tu cupón al unirte a la manada — membresía de salud para tu peludo (michi o lomito):</p>
            <p style="margin:0;font-size:13.5px;line-height:2;color:#3D524F;">
              🐾 Disponible en todo México<br>
              🐾 Mantienes a tu veterinario<br>
              🐾 Incluye hasta 3 peludos<br>
              🐾 Orientación veterinaria 24/7<br>
              🐾 100% digital
            </p>
          </td></tr>
        </table>
      </td></tr>

      <!-- CTA -->
      <tr><td style="background-color:#FFFFFF;padding:22px 32px 34px;text-align:center;">
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto;">
          <tr><td style="background-color:#1E5350;border-radius:999px;">
            <a href="{{registroUrl}}" style="display:inline-block;padding:15px 36px;font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;">Unirme a la manada</a>
          </td></tr>
        </table>
        <p style="margin:14px 0 0;font-size:12px;color:#8A9490;">Membresía desde $159 MXN al mes · No es un seguro</p>
      </td></tr>

      <!-- Pie -->
      <tr><td style="background-color:#1E5350;border-radius:0 0 20px 20px;padding:24px 32px;text-align:center;">
        <p style="margin:0 0 8px;font-size:13px;font-weight:bold;color:#FFFFFF;">Pata Amiga · El mejor cuidado para tu manada</p>
        <p style="margin:0 0 10px;font-size:12px;line-height:1.7;color:#BFD9D6;">
          ¿Dudas? Escríbenos a <a href="mailto:soporte@pataamiga.mx" style="color:#A6CE39;text-decoration:none;">soporte@pataamiga.mx</a><br>
          <a href="https://www.instagram.com/pataamigamx" style="color:#BFD9D6;text-decoration:underline;">Instagram</a> &nbsp;·&nbsp;
          <a href="https://www.facebook.com/share/14YQRpe9WzS/" style="color:#BFD9D6;text-decoration:underline;">Facebook</a> &nbsp;·&nbsp;
          <a href="https://www.tiktok.com/@pataamigamx" style="color:#BFD9D6;text-decoration:underline;">TikTok</a>
        </p>
        <p style="margin:0;font-size:10.5px;line-height:1.6;color:#8FB5B1;">
          Recibiste este correo porque te registraste para recibir tu regalo de bienvenida.<br>
          Si no fuiste tú, puedes ignorar este mensaje.<br>
          GIRBAZ, S.A. de C.V. y PATA AMIGA, A.C. · Hecho con ♡ en México
        </p>
      </td></tr>

    </table>
  </td></tr>
</table>`;

export const EMAIL_TEMPLATES: EmailTemplateDef[] = [
  {
    key: "welcome",
    name: "Bienvenida a la manada",
    description: "Al confirmarse el pago de la membresía (webhook de Stripe).",
    variables: {
      firstName: "Nombre del miembro (puede venir vacío)",
      petNotice:
        "Frase sobre el primer peludo y su tiempo de espera (vacía si no aplica)",
    },
    sample: {
      firstName: "Cipatli",
      petNotice:
        "<strong>Max</strong> entra a revisión del comité y su tiempo de espera de 120 días corre desde hoy.",
    },
    subject: "¡Bienvenido a la manada! 🐾",
    html: WRAP(`<h1 style="color:#1E5350">¡Bienvenido a la manada, {{firstName}}!</h1>
<p>Tu membresía de Club Pata Amiga está <strong>activa</strong> y la orientación veterinaria 24/7 ya está disponible para ti.</p>
<p>{{petNotice}}</p>
<p>Siguiente paso: completa tu perfil para habilitar los reintegros.</p>`),
  },
  {
    key: "cancellation",
    name: "Cancelación confirmada",
    description: "Cuando el miembro cancela la renovación de su membresía.",
    variables: {
      firstName: "Nombre del miembro",
      coverageEndLine:
        "Texto con la fecha de fin (ej. 'hasta el 14 de agosto de 2026')",
    },
    sample: {
      firstName: "Cipatli",
      coverageEndLine: "hasta el <strong>14 de agosto de 2026</strong>",
    },
    subject: "Confirmamos la cancelación de tu membresía",
    html: WRAP(`<h2 style="color:#1E5350">Lamentamos que te vayas, {{firstName}} 🐾</h2>
<p>Tu membresía seguirá activa {{coverageEndLine}}. Hasta entonces, tu manada sigue protegida.</p>
<p>Cuando quieras volver, tu información seguirá aquí — reingresar a la manada toma un minuto.</p>`),
  },
  {
    key: "reimbursement_approved",
    name: "Reintegro aprobado",
    description: "Cuando el comité aprueba un reintegro (total o parcial).",
    variables: {
      folio: "Folio de la solicitud (ej. R-0001)",
      amount: "Monto aprobado con formato (ej. $1,250)",
      petName: "Nombre del peludo",
    },
    sample: { folio: "R-0001", amount: "$1,250", petName: "Max" },
    subject: "¡Tu reintegro {{folio}} fue aprobado! 🎉",
    html: WRAP(`<h2 style="color:#1E5350">¡Tu reintegro {{folio}} fue aprobado! 🎉</h2>
<p>Aprobamos <strong>{{amount}} MXN</strong> para <strong>{{petName}}</strong>.</p>
<p>Recibirás tu transferencia bancaria en un máximo de <strong>72 horas</strong>.</p>`),
  },
  {
    key: "reimbursement_rejected",
    name: "Reintegro no aprobado",
    description: "Cuando el comité rechaza un reintegro (incluye motivo).",
    variables: {
      folio: "Folio de la solicitud",
      petName: "Nombre del peludo",
      reason: "Motivo del rechazo",
    },
    sample: { folio: "R-0001", petName: "Max", reason: "Factura ilegible" },
    subject: "Resolución de tu reintegro {{folio}}",
    html: WRAP(`<h2 style="color:#1E5350">Resolución de tu reintegro {{folio}}</h2>
<p>Tu solicitud para <strong>{{petName}}</strong> no pudo aprobarse en esta revisión.</p>
<p><strong>Motivo:</strong> {{reason}}</p>
<p>Si crees que hay un error, puedes apelar desde tu cuenta y el comité hará una segunda revisión.</p>`),
  },
  {
    key: "pet_approved",
    name: "Peludo aprobado",
    description: "Cuando el comité aprueba el perfil de un peludo.",
    variables: { petName: "Nombre del peludo" },
    sample: { petName: "Max" },
    subject: "¡{{petName}} fue aprobado por el comité! 🐾",
    html: WRAP(`<h2 style="color:#1E5350">¡{{petName}} fue aprobado por el comité! 🐾</h2>
<p>Su perfil quedó aprobado y su tiempo de espera sigue corriendo con normalidad.</p>`),
  },
  {
    key: "pet_rejected",
    name: "Peludo con observaciones",
    description: "Cuando el perfil de un peludo necesita correcciones.",
    variables: {
      petName: "Nombre del peludo",
      notes: "Observaciones del comité",
    },
    sample: { petName: "Max", notes: "Falta el certificado veterinario." },
    subject: "El perfil de {{petName}} necesita atención",
    html: WRAP(`<h2 style="color:#1E5350">El perfil de {{petName}} necesita atención</h2>
<p><strong>Observaciones del comité:</strong> {{notes}}</p>
<p>Entra a tu cuenta para actualizar la información o los documentos.</p>`),
  },
  {
    key: "pet_info_request",
    name: "El comité pide información (peludo)",
    description:
      "Cuando el comité solicita fotos/documentos o escribe al miembro sobre un peludo.",
    variables: {
      firstName: "Nombre del miembro",
      petName: "Nombre del peludo",
      itemsList: "Lista de lo solicitado (puede venir vacía)",
      message: "Mensaje del comité",
      fichaUrl: "URL del perfil del peludo",
    },
    sample: {
      firstName: "Cipatli",
      petName: "Max",
      itemsList: "<li>📸 Foto principal</li><li>🏥 Certificado veterinario</li>",
      message: "La foto actual no permite ver bien a Max, ¿puedes subir una más clara?",
      fichaUrl: "https://pataamiga.mx/app/peludos/xxx",
    },
    subject: "El comité necesita información sobre {{petName}} 🐾",
    html: WRAP(`<h2 style="color:#1E5350">Necesitamos tu ayuda con {{petName}}</h2>
<p>Hola {{firstName}}, el comité te escribió sobre el perfil de <strong>{{petName}}</strong>:</p>
<ul>{{itemsList}}</ul>
<p style="background:#FAF7F1;border-radius:12px;padding:12px">{{message}}</p>
<p style="text-align:center;margin:16px 0"><a href="{{fichaUrl}}" style="background:#1CBCAD;color:#fff;padding:12px 26px;border-radius:999px;font-weight:700;text-decoration:none">Abrir el perfil de {{petName}}</a></p>`),
  },
  {
    key: "ambassador_received",
    name: "Solicitud de embajador recibida",
    description: "Acuse al enviar la solicitud del programa de embajadores.",
    variables: { firstName: "Nombre del solicitante" },
    sample: { firstName: "Paola" },
    subject: "Recibimos tu solicitud de embajador 🐾",
    html: WRAP(`<h2 style="color:#1E5350">¡Gracias, {{firstName}}!</h2>
<p>Recibimos tu solicitud para ser embajador de Club Pata Amiga.</p>
<p>El comité la revisará y te contactaremos por este correo. Al ser aprobada, recibirás tu código único para empezar a generar comisiones.</p>`),
  },
  {
    key: "ambassador_approved",
    name: "Embajador aprobado",
    description: "Cuando el comité aprueba a un embajador (incluye su código).",
    variables: {
      firstName: "Nombre del embajador",
      code: "Código asignado (ej. PATAMIGA-PAOLA)",
      accessLine:
        "Instrucción de acceso (entra a tu dashboard / crea tu cuenta)",
    },
    sample: {
      firstName: "Paola",
      code: "PATAMIGA-PAOLA",
      accessLine:
        'Entra a tu dashboard en <a href="https://pataamiga.mx/embajador" style="color:#0E8377">pataamiga.mx/embajador</a> para copiar tu link, ver tus referidos y descargar materiales.',
    },
    subject: "¡Ya eres embajador de Pata Amiga! 🎉",
    html: WRAP(`<h2 style="color:#1E5350">¡Bienvenido al equipo, {{firstName}}!</h2>
<p>El comité aprobó tu solicitud. Tu código de embajador es:</p>
<p style="font-size:24px;font-weight:800;color:#1E5350;letter-spacing:.04em">{{code}}</p>
<p>Cada suscripción con tu código te genera comisión, con corte mensual y pago el día 5.</p>
<p>{{accessLine}}</p>`),
  },
  {
    key: "account_deactivated",
    name: "Baja de cuenta (por el comité)",
    description:
      "Cuando el super admin da de baja la cuenta de un miembro (la membresía se cancela de inmediato).",
    variables: {
      firstName: "Nombre del miembro",
      reason: "Motivo de la baja",
    },
    sample: {
      firstName: "Cipatli",
      reason:
        "Incumplimiento de las políticas de convivencia y bienestar animal de Club Pata Amiga.",
    },
    subject: "Aviso importante sobre tu membresía",
    html: WRAP(`<h2 style="color:#1E5350">Hola, {{firstName}}</h2>
<p>Te escribimos para informarte que tu membresía de Club Pata Amiga fue dada de baja por el comité.</p>
<p><strong>Motivo:</strong> {{reason}}</p>
<p>A partir de hoy tu membresía deja de estar activa. Si crees que hay un error o quieres compartir tu versión, responde a este correo y con gusto lo revisamos.</p>`),
  },
  {
    key: "ambassador_rejected",
    name: "Embajador no aprobado",
    description: "Cuando el comité rechaza una solicitud de embajador.",
    variables: {
      firstName: "Nombre del solicitante",
      reason: "Motivo del rechazo",
    },
    sample: { firstName: "Paola", reason: "Información incompleta" },
    subject: "Resolución de tu solicitud de embajador",
    html: WRAP(`<h2 style="color:#1E5350">Hola, {{firstName}}</h2>
<p>El comité revisó tu solicitud de embajador y no pudo aprobarla en esta ocasión.</p>
<p><strong>Motivo:</strong> {{reason}}</p>
<p>Si crees que hay un error, responde a este correo y lo revisamos.</p>`),
  },
  {
    key: "profile_incomplete_reminder",
    name: "Recordatorio de datos faltantes",
    description:
      "Recordatorio periódico a miembros con el perfil incompleto: sin esos datos no se habilitan los reintegros. Se envía desde Comunicados → Envíos (o el cron semanal).",
    variables: {
      firstName: "Nombre del miembro",
      missingList: "Lista de lo que falta (CURP, domicilio, etc.)",
    },
    sample: {
      firstName: "Cipatli",
      missingList: "fecha de nacimiento · nacionalidad · domicilio",
    },
    subject: "Te falta poco para habilitar tus reintegros 🐾",
    html: WRAP(`<h2 style="color:#1E5350">Hola, {{firstName}}</h2>
<p>Tu membresía de Club Pata Amiga está activa, pero aún nos faltan algunos datos para habilitar tus reintegros:</p>
<p style="background:#FDF3E0;border-radius:12px;padding:12px 16px"><strong>{{missingList}}</strong></p>
<p>Completa tu perfil en un par de minutos y tu manada queda protegida al 100%.</p>
<p><a href="https://www.pataamiga.mx/app/perfil" style="display:inline-block;background:#1CBCAD;color:#fff;border-radius:999px;padding:12px 26px;font-weight:700;text-decoration:none">Completar mi perfil</a></p>`),
  },
  {
    key: "ambassador_deactivated",
    name: "Baja de embajador (por el comité)",
    description:
      "Cuando el super admin da de baja a un embajador: su código deja de generar comisiones nuevas.",
    variables: {
      firstName: "Nombre del embajador",
      reason: "Motivo de la baja",
    },
    sample: {
      firstName: "Paola",
      reason: "Inactividad prolongada del programa de embajadores.",
    },
    subject: "Aviso sobre tu participación como embajador",
    html: WRAP(`<h2 style="color:#1E5350">Hola, {{firstName}}</h2>
<p>Te escribimos para informarte que tu participación como embajador de Club Pata Amiga fue dada de baja por el comité.</p>
<p><strong>Motivo:</strong> {{reason}}</p>
<p>Tu código de embajador deja de generar comisiones nuevas a partir de hoy. Si crees que hay un error o quieres compartir tu versión, responde a este correo y con gusto lo revisamos.</p>`),
  },
  {
    key: "campaign_gift",
    name: "Regalo de campaña (landings)",
    description:
      "Se envía al registrarse en una landing de campaña (/landings/…). Los bloques de cupón y PDF se arman solos según lo cargado en Admin → Landings.",
    variables: {
      firstName: "Nombre del registrado",
      couponBlock: "Caja con la palabra cupón (o aviso de que se activará pronto)",
      pdfBlock: "Botón de descarga de la guía PDF (vacío si aún no se sube)",
      registroUrl: "URL del registro de la membresía",
    },
    sample: {
      firstName: "Cipatli",
      couponBlock:
        '<div style="background:#FDF9EF;border:2px dashed #1CBCAD;border-radius:14px;padding:16px;text-align:center;margin:8px 0"><span style="font-size:12px;color:#6B7C79">TU CUPÓN</span><br><span style="font-size:26px;font-weight:800;color:#1E5350;letter-spacing:.06em">MANADA10</span></div>',
      pdfBlock:
        '<p style="text-align:center;margin:16px 0"><a href="#" style="background:#1CBCAD;color:#fff;padding:14px 28px;border-radius:999px;font-weight:700;text-decoration:none">📘 Descargar tu guía de cuidado</a></p>',
      registroUrl: "https://pataamiga.mx/registro",
    },
    subject: "🎁 Obtén tu regalo — Club Pata Amiga",
    html: CAMPAIGN_GIFT_HTML,
  },
  {
    key: "appeal_received",
    name: "Apelación recibida",
    description: "Acuse al presentar una apelación (reintegro o peludo).",
    variables: {
      firstName: "Nombre del miembro",
      folio: "Folio de la apelación (ej. A-0001)",
      subject: "Qué se apela (ej. 'el reintegro R-0001' o 'el perfil de Max')",
    },
    sample: { firstName: "Cipatli", folio: "A-0001", subject: "el reintegro R-0001" },
    subject: "Recibimos tu apelación {{folio}}",
    html: WRAP(`<h2 style="color:#1E5350">Recibimos tu apelación {{folio}}</h2>
<p>El comité hará una segunda revisión sobre {{subject}} y te avisaremos por este medio con la resolución.</p>
<p>Gracias por tu paciencia, {{firstName}} 🐾</p>`),
  },
  {
    key: "appeal_accepted",
    name: "Apelación aceptada",
    description: "Cuando el comité acepta una apelación en segunda revisión.",
    variables: {
      firstName: "Nombre del miembro",
      folio: "Folio de la apelación",
      outcome: "Qué pasa ahora (ej. 'tu solicitud volvió a revisión' / 'el perfil de Max quedó aprobado')",
    },
    sample: {
      firstName: "Cipatli",
      folio: "A-0001",
      outcome: "tu solicitud R-0001 volvió a revisión del comité",
    },
    subject: "¡Tu apelación {{folio}} fue aceptada! 🎉",
    html: WRAP(`<h2 style="color:#1E5350">¡Tu apelación {{folio}} fue aceptada!</h2>
<p>Tras la segunda revisión, {{outcome}}.</p>
<p>Gracias por la información adicional, {{firstName}}.</p>`),
  },
  {
    key: "appeal_rejected",
    name: "Apelación no aceptada",
    description: "Cuando el comité mantiene la decisión tras la apelación.",
    variables: {
      firstName: "Nombre del miembro",
      folio: "Folio de la apelación",
      notes: "Explicación del comité",
    },
    sample: {
      firstName: "Cipatli",
      folio: "A-0001",
      notes: "La factura sigue sin cumplir los requisitos fiscales.",
    },
    subject: "Resolución de tu apelación {{folio}}",
    html: WRAP(`<h2 style="color:#1E5350">Resolución de tu apelación {{folio}}</h2>
<p>El comité hizo una segunda revisión y la decisión original se mantiene.</p>
<p><strong>Explicación:</strong> {{notes}}</p>
<p>Si tienes información nueva, {{firstName}}, puedes escribirnos a este correo.</p>`),
  },
  {
    key: "center_received",
    name: "Solicitud de centro recibida",
    description: "Acuse al enviar la solicitud de centro aliado.",
    variables: {
      contactName: "Nombre de contacto",
      centerName: "Nombre del centro",
    },
    sample: { contactName: "Dra. Lucía Ramos", centerName: "Vet San Ángel" },
    subject: "Recibimos tu solicitud de centro aliado 🐾",
    html: WRAP(`<h2 style="color:#1E5350">¡Gracias, {{contactName}}!</h2>
<p>Recibimos la solicitud de <strong>{{centerName}}</strong> para unirse a la red de centros aliados de Club Pata Amiga.</p>
<p>El comité la revisará y te contactaremos por este correo con la resolución.</p>`),
  },
  {
    key: "center_approved",
    name: "Centro aliado aprobado",
    description: "Cuando el comité aprueba un centro (aparece en directorio).",
    variables: {
      contactName: "Nombre de contacto",
      centerName: "Nombre del centro",
      directoryUrl: "URL del directorio público",
    },
    sample: {
      contactName: "Dra. Lucía Ramos",
      centerName: "Vet San Ángel",
      directoryUrl: "https://pataamiga.mx/centros",
    },
    subject: "¡{{centerName}} ya es centro aliado de Pata Amiga! 🎉",
    html: WRAP(`<h2 style="color:#1E5350">¡Bienvenidos a la red, {{contactName}}!</h2>
<p>El comité aprobó la solicitud de <strong>{{centerName}}</strong>. Tu centro ya aparece en el directorio público:</p>
<p><a href="{{directoryUrl}}" style="color:#0E8377">{{directoryUrl}}</a></p>
<p>Los miembros de la manada verán tu beneficio y podrán visitarte. 🐾</p>`),
  },
  {
    key: "center_rejected",
    name: "Centro aliado no aprobado",
    description: "Cuando el comité rechaza la solicitud de un centro.",
    variables: {
      contactName: "Nombre de contacto",
      centerName: "Nombre del centro",
      reason: "Motivo del rechazo",
    },
    sample: {
      contactName: "Dra. Lucía Ramos",
      centerName: "Vet San Ángel",
      reason: "No pudimos verificar los datos del establecimiento",
    },
    subject: "Resolución de tu solicitud de centro aliado",
    html: WRAP(`<h2 style="color:#1E5350">Hola, {{contactName}}</h2>
<p>El comité revisó la solicitud de <strong>{{centerName}}</strong> y no pudo aprobarla en esta ocasión.</p>
<p><strong>Motivo:</strong> {{reason}}</p>
<p>Si crees que hay un error o quieres actualizar la información, responde a este correo.</p>`),
  },
  {
    key: "plan_migrado",
    name: "Cambio de beneficios de la membresía",
    description:
      "Cuando un super admin migra a un miembro a otra versión de su plan (Ventas → Membresías → Migrar cohorte). Nunca hay migración silenciosa: este correo es parte de la acción.",
    variables: {
      firstName: "Nombre del miembro",
      cambiosHtml:
        "Lista <ul> con cada beneficio que cambió, del valor anterior al nuevo",
    },
    sample: {
      firstName: "Cipatli",
      cambiosHtml:
        "<ul><li><strong>Tope anual — gastos veterinarios</strong>: $3,000 MXN → $4,000 MXN</li></ul>",
    },
    subject: "Actualizamos los beneficios de tu membresía 🐾",
    html: WRAP(`<h2 style="color:#1E5350">Hola {{firstName}}, tu membresía cambió</h2>
<p>Actualizamos los beneficios de tu membresía de Club Pata Amiga. Esto es lo que cambió:</p>
{{cambiosHtml}}
<p>No tienes que hacer nada: el cambio ya está aplicado en tu cuenta y lo puedes ver en cualquier momento desde tu panel.</p>
<p>Si tienes dudas, respóndenos este correo y con gusto te explicamos.</p>`),
  },
  {
    key: "birthday_member",
    name: "Cumpleaños del miembro",
    description:
      "Automático: el día del cumpleaños del miembro (requiere fecha de nacimiento en su perfil).",
    variables: {
      firstName: "Nombre del miembro",
    },
    sample: {
      firstName: "Cipatli",
    },
    subject: "¡Feliz cumpleaños, {{firstName}}! 🎂🐾",
    html: WRAP(`<h1 style="color:#1E5350">¡Feliz cumpleaños, {{firstName}}! 🎉</h1>
<p>Hoy toda la manada de Club Pata Amiga celebra contigo. Gracias por cuidar a tus peludos con tanto cariño durante todo el año.</p>
<p>Que tu día esté lleno de lengüetazos, ronroneos y mucho amor. 🐾</p>
<p>Con cariño,<br>El equipo de Pata Amiga</p>`),
  },
  {
    key: "birthday_pet",
    name: "Cumpleaños del peludo",
    description:
      "Automático: el día del cumpleaños de un peludo registrado (usa mes y año de nacimiento).",
    variables: {
      firstName: "Nombre del tutor",
      petName: "Nombre del peludo",
      petEmoji: "🐶 o 🐱 según la especie",
      ageLine: "Frase sobre la edad que cumple (vacía si no se sabe el año)",
    },
    sample: {
      firstName: "Cipatli",
      petName: "Max",
      petEmoji: "🐶",
      ageLine: "¡Hoy cumple 3 años!",
    },
    subject: "¡Hoy es el cumpleaños de {{petName}}! {{petEmoji}}🎉",
    html: WRAP(`<h1 style="color:#1E5350">¡Feliz cumpleaños, {{petName}}! {{petEmoji}}</h1>
<p>Hola {{firstName}}, hoy es un día muy especial: {{petName}} está de fiesta. {{ageLine}}</p>
<p>En Club Pata Amiga celebramos a cada integrante de la manada. Consiéntelo con un premio, unos mimos extra y mucho juego. 🐾</p>
<p>Con cariño,<br>El equipo de Pata Amiga</p>`),
  },
];

/**
 * Categorías para agrupar el menú de comunicados (antes era una lista larga).
 * El orden aquí es el orden en que se muestran.
 */
export const EMAIL_CATEGORIES = [
  { id: "membresia", label: "Membresía", icon: "🎫" },
  { id: "reintegros", label: "Reintegros", icon: "💚" },
  { id: "mascotas", label: "Peludos", icon: "🐾" },
  { id: "apelaciones", label: "Apelaciones", icon: "⚖️" },
  { id: "embajadores", label: "Embajadores", icon: "🤝" },
  { id: "centros", label: "Centros aliados", icon: "📍" },
  { id: "campanas", label: "Campañas", icon: "🎯" },
  { id: "celebraciones", label: "Celebraciones", icon: "🎂" },
] as const;

export type EmailCategoryId = (typeof EMAIL_CATEGORIES)[number]["id"];

/** A qué categoría pertenece cada plantilla (por su key). */
export const TEMPLATE_CATEGORY: Record<string, EmailCategoryId> = {
  welcome: "membresia",
  cancellation: "membresia",
  account_deactivated: "membresia",
  profile_incomplete_reminder: "membresia",
  reimbursement_approved: "reintegros",
  reimbursement_rejected: "reintegros",
  pet_approved: "mascotas",
  pet_rejected: "mascotas",
  pet_info_request: "mascotas",
  appeal_received: "apelaciones",
  appeal_accepted: "apelaciones",
  appeal_rejected: "apelaciones",
  ambassador_received: "embajadores",
  ambassador_approved: "embajadores",
  ambassador_rejected: "embajadores",
  ambassador_deactivated: "embajadores",
  center_received: "centros",
  center_approved: "centros",
  center_rejected: "centros",
  campaign_gift: "campanas",
  birthday_member: "celebraciones",
  birthday_pet: "celebraciones",
};

export function getTemplateDef(key: string): EmailTemplateDef | undefined {
  return EMAIL_TEMPLATES.find((t) => t.key === key);
}

/** Sustituye {{variables}}; las no provistas quedan vacías. */
export function renderTemplate(
  text: string,
  vars: Record<string, string>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, name) => vars[name] ?? "");
}
