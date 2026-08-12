import type { createAdminClient } from "@/lib/supabase/admin";
import { publicadorDe } from "@/lib/content/registry";
import { notifyTeam } from "@/lib/alerts";
import { ZONA_MX } from "@/lib/zona-horaria";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * EL PUBLICADOR — sección 4, punto 6. Corre cada 5 minutos.
 *
 * Su consulta es la razón de ser de toda la sección:
 *
 *   status = 'programado' AND approved_by IS NOT NULL AND scheduled_for <= now()
 *
 * Un error de interfaz no puede saltarse eso, porque la interfaz no participa.
 *
 * Tres cosas que hace y conviene no perder:
 *
 *  1. Guarda el resultado POR CANAL. Si de tres canales falla uno, reintenta
 *     ese y nada más — reintentar el post entero duplicaría lo que ya salió.
 *  2. Reintenta con espera creciente y un máximo. Al agotarse AVISA: un post
 *     que no salió y nadie lo supo es peor que uno que no se programó.
 *  3. Los canales asistidos no se publican solos: se le avisa a su
 *     responsable con el copy y el archivo, y el post queda esperándolo.
 */

/** Espera antes de cada reintento. El último es a la hora siguiente. */
const ESPERA_MINUTOS = [5, 20, 60];
const MAX_INTENTOS = ESPERA_MINUTOS.length + 1;

const SITIO = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export type ResumenPublicacion = {
  revisados: number;
  publicados: number;
  fallidos: number;
  asistidosAvisados: number;
  reintentosPendientes: number;
};

type FilaDestino = {
  id: string;
  post_id: string;
  channel_id: string;
  status: string;
  attempts: number;
  next_attempt_at: string | null;
  notified_at: string | null;
};

/** Avisa al equipo, sin tumbar la corrida si el correo falla. */
async function avisar(evento: string, asunto: string, html: string) {
  try {
    await notifyTeam(evento, asunto, html);
  } catch (err) {
    console.error("[publicador] no se pudo avisar", err);
  }
}

/** Campanita en el panel de una persona concreta. */
async function campana(
  admin: Admin,
  userId: string | null,
  type: string,
  title: string,
  message: string,
) {
  if (!userId) return;
  try {
    await admin.from("notifications").insert({ user_id: userId, type, title, message });
  } catch (err) {
    console.error("[publicador] no se pudo dejar la campanita", err);
  }
}

async function anotar(
  admin: Admin,
  postId: string,
  kind: string,
  summary: string,
  payload: Record<string, unknown> = {},
) {
  try {
    await admin.from("content_post_events").insert({
      post_id: postId,
      kind,
      summary,
      actor_label: "Plataforma",
      payload,
    });
  } catch (err) {
    console.error("[publicador] no se pudo anotar", err);
  }
}

/**
 * AVISO PREVIO — la persona en medio.
 *
 * Antes de publicar, con la antelación configurada, se avisa al equipo con el
 * enlace al calendario para verlo o cancelarlo. Nada sale sin que alguien haya
 * tenido oportunidad de detenerlo.
 */
export async function avisarAntesDePublicar(
  admin: Admin,
  horasDeAntelacion: number,
): Promise<number> {
  if (horasDeAntelacion <= 0) return 0;

  const limite = new Date(Date.now() + horasDeAntelacion * 3600_000).toISOString();
  const { data: proximos } = await admin
    .from("content_posts")
    .select("id, title, scheduled_for, created_by, approved_by")
    .eq("status", "programado")
    .not("approved_by", "is", null)
    .lte("scheduled_for", limite)
    .is("prenotified_at", null)
    .limit(50);

  let avisados = 0;
  for (const post of proximos ?? []) {
    const cuando = post.scheduled_for
      ? new Date(post.scheduled_for).toLocaleString("es-MX", { timeZone: ZONA_MX })
      : "pronto";

    await avisar(
      "notify_contenido_por_publicar",
      `Se publica ${cuando}: ${post.title}`,
      `<p>Este contenido se publica <strong>${cuando}</strong>.</p>
       <p><strong>${post.title}</strong></p>
       <p>Si hay que detenerlo, entra al calendario y cancélalo antes de esa hora:<br>
       <a href="${SITIO}/ventas/calendario">${SITIO}/ventas/calendario</a></p>`,
    );
    // Al autor y a quien lo aprobó, en su campanita.
    await campana(
      admin,
      post.created_by,
      "contenido_por_publicar",
      `Se publica ${cuando}`,
      `"${post.title}" se publica pronto. Puedes cancelarlo desde el calendario.`,
    );
    if (post.approved_by && post.approved_by !== post.created_by)
      await campana(
        admin,
        post.approved_by,
        "contenido_por_publicar",
        `Se publica ${cuando}`,
        `"${post.title}", que aprobaste, se publica pronto.`,
      );

    await admin
      .from("content_posts")
      .update({ prenotified_at: new Date().toISOString() })
      .eq("id", post.id);
    await anotar(admin, post.id, "aviso_previo", `Avisado ${horasDeAntelacion} h antes`);
    avisados++;
  }
  return avisados;
}

/** Publica todo lo que ya cumplió su hora. */
export async function publicarPendientes(admin: Admin): Promise<ResumenPublicacion> {
  const resumen: ResumenPublicacion = {
    revisados: 0,
    publicados: 0,
    fallidos: 0,
    asistidosAvisados: 0,
    reintentosPendientes: 0,
  };

  const ahora = new Date();

  // LA consulta. Sin aprobación no entra, y la interfaz no participa.
  const { data: posts } = await admin
    .from("content_posts")
    .select("id, title, body, assets, scheduled_for, created_by")
    .eq("status", "programado")
    .not("approved_by", "is", null)
    .lte("scheduled_for", ahora.toISOString())
    .limit(25);

  for (const post of posts ?? []) {
    resumen.revisados++;

    const { data: destinos } = await admin
      .from("content_post_targets")
      .select("id, post_id, channel_id, status, attempts, next_attempt_at, notified_at")
      .eq("post_id", post.id);
    if (!destinos || destinos.length === 0) continue;

    const { data: canales } = await admin
      .from("content_channels")
      .select("id, platform, handle, mode, assignee_id, credentials, is_active")
      .in("id", destinos.map((d) => d.channel_id));
    const canalPorId = new Map((canales ?? []).map((c) => [c.id, c]));

    for (const destino of destinos as FilaDestino[]) {
      if (destino.status === "publicado") continue;
      // Todavía no toca reintentar.
      if (destino.next_attempt_at && new Date(destino.next_attempt_at) > ahora) {
        resumen.reintentosPendientes++;
        continue;
      }

      const canal = canalPorId.get(destino.channel_id);
      if (!canal || !canal.is_active) {
        await admin
          .from("content_post_targets")
          .update({ status: "fallido", error: "La cuenta está apagada o ya no existe." })
          .eq("id", destino.id);
        continue;
      }

      // --- Modo asistido: la publica una persona ---------------------------
      if (canal.mode === "asistido") {
        if (destino.notified_at) continue; // ya se avisó; se espera a la persona

        const activos = ((post.assets as string[]) ?? []).join("\n");
        await avisar(
          "notify_contenido_asistido",
          `Te toca publicar: ${post.title}`,
          `<p>Llegó la hora de publicar en <strong>${canal.platform} @${canal.handle}</strong>.</p>
           <p><strong>Copy listo para copiar:</strong></p>
           <blockquote style="border-left:3px solid #1CBCAD;padding-left:12px">${post.body.replace(/\n/g, "<br>")}</blockquote>
           ${activos ? `<p><strong>Archivos:</strong><br>${activos.split("\n").map((a) => `<a href="${a}">${a}</a>`).join("<br>")}</p>` : ""}
           <p>Cuando lo publiques, marca el canal como publicado y pega el enlace:<br>
           <a href="${SITIO}/ventas/calendario">${SITIO}/ventas/calendario</a></p>`,
        );
        await campana(
          admin,
          canal.assignee_id,
          "contenido_asistido",
          `Te toca publicar en ${canal.platform}`,
          `"${post.title}" está listo. Publícalo y pega el enlace en el calendario.`,
        );

        await admin
          .from("content_post_targets")
          .update({ status: "asistido", notified_at: ahora.toISOString() })
          .eq("id", destino.id);
        await anotar(
          admin,
          post.id,
          "asistido_avisado",
          `Avisó a quien publica en ${canal.platform} @${canal.handle}`,
        );
        resumen.asistidosAvisados++;
        continue;
      }

      // --- Modo automático --------------------------------------------------
      const pub = publicadorDe(canal.platform);
      const intentos = destino.attempts + 1;

      try {
        if (!pub?.publicar) throw new Error(`No hay publicador automático para ${canal.platform}.`);
        const hecho = await pub.publicar({
          texto: post.body,
          activos: (post.assets as string[]) ?? [],
          credenciales: (canal.credentials as Record<string, unknown> | null) ?? null,
        });
        await admin
          .from("content_post_targets")
          .update({
            status: "publicado",
            external_id: hecho.externalId,
            external_url: hecho.url,
            attempts: intentos,
            error: null,
            next_attempt_at: null,
            published_at: ahora.toISOString(),
          })
          .eq("id", destino.id);
        await anotar(admin, post.id, "publicado_canal", `Publicado en ${canal.platform}`, {
          url: hecho.url,
        });
        resumen.publicados++;
      } catch (err) {
        const mensaje = err instanceof Error ? err.message : "Error al publicar";
        const agotado = intentos >= MAX_INTENTOS;
        const espera = ESPERA_MINUTOS[intentos - 1];

        await admin
          .from("content_post_targets")
          .update({
            status: "fallido",
            error: mensaje,
            attempts: intentos,
            next_attempt_at: agotado
              ? null
              : new Date(ahora.getTime() + espera * 60_000).toISOString(),
          })
          .eq("id", destino.id);
        await admin
          .from("content_channels")
          .update({ last_error: mensaje })
          .eq("id", canal.id);

        if (agotado) {
          await anotar(
            admin,
            post.id,
            "fallo_canal",
            `No se pudo publicar en ${canal.platform} tras ${intentos} intentos: ${mensaje}`,
          );
          await avisar(
            "notify_contenido_fallido",
            `No se pudo publicar: ${post.title}`,
            `<p>Se agotaron los ${intentos} intentos en <strong>${canal.platform} @${canal.handle}</strong>.</p>
             <p>${mensaje}</p>
             <p><a href="${SITIO}/ventas/calendario">Ver en el calendario</a></p>`,
          );
          await campana(
            admin,
            post.created_by,
            "contenido_fallido",
            "No se pudo publicar",
            `"${post.title}" falló en ${canal.platform}: ${mensaje}`,
          );
          resumen.fallidos++;
        } else {
          resumen.reintentosPendientes++;
        }
      }
    }

    // --- ¿En qué queda el post? ---------------------------------------------
    const { data: finales } = await admin
      .from("content_post_targets")
      .select("status, attempts")
      .eq("post_id", post.id);

    const todos = finales ?? [];
    const esperandoPersona = todos.some((t) => t.status === "asistido");
    const reintentando = todos.some(
      (t) => t.status === "fallido" && t.attempts < MAX_INTENTOS,
    );
    const agotados = todos.some(
      (t) => t.status === "fallido" && t.attempts >= MAX_INTENTOS,
    );
    const todosPublicados = todos.every((t) => t.status === "publicado");

    if (todosPublicados) {
      await admin.from("content_posts").update({ status: "publicado" }).eq("id", post.id);
      await anotar(admin, post.id, "publicado", "Salió en todos sus canales");
    } else if (agotados && !esperandoPersona && !reintentando) {
      await admin.from("content_posts").update({ status: "fallido" }).eq("id", post.id);
    }
    // Si queda gente por publicar a mano o reintentos pendientes, el post sigue
    // 'programado' a propósito: todavía no terminó.
  }

  return resumen;
}
