import test from 'node:test';

/**
 * Pruebas de punta a punta del webhook de Flowly contra una base local.
 *
 * PENDIENTES: necesitan la pila local de Supabase con la migración
 * 20261019000000_flowly_gateway.sql aplicada y `next start` corriendo, y estas
 * pruebas no levantan ni apagan pilas (regla de la casa: la sesión que
 * orquesta lo hace). Se dejan escritas como lista de verificación; cada una
 * firma el cuerpo con FLOWLY_WEBHOOK_SECRET (firmarComoFlowly) y hace POST a
 * /api/canales/flowly/webhook con LLM_PROVIDER=mock y SIN FLOWLY_API_KEY real
 * (o con FLOWLY_API_BASE apuntando a un servidor falso local).
 */

const pendiente = { todo: 'requiere Supabase local + next start (ver encabezado)' };

test('message.received de texto → conversación provider=flowly, mensaje, contacto, primer_mensaje y oportunidad en nuevo_prospecto', pendiente);
test('la misma entrega dos veces (mismo Flowly-Delivery) → un solo mensaje y una sola corrida del LLM', pendiente);
test('número de WhatsApp con hilo viejo del camino directo → se adopta ese hilo, no se duplica', pendiente);
test('message.received con referral → first_referral y last_referral en el hilo, contacts.source=whatsapp_ad y custom_fields.anuncio en contacto y oportunidad', pendiente);
test('conversation.updated con first_referral antes de que la persona escriba (Messenger) → al llegar su primer mensaje queda atribuido', pendiente);
test('segundo anuncio → solo cambia last_referral; first_referral y el CRM se quedan con el primero', pendiente);
test('message.received de audio sin texto → «[Nota de voz]» y la IA pide la pregunta por escrito (regla 4 del prompt)', pendiente);
test('message.sent con actor native_app → mensaje del equipo con external_actor=native_app y human_takeover=true', pendiente);
test('message.sent de nuestro propio actor → no se duplica; message.updated amarra delivered/read', pendiente);
test('conversation.updated viejo (created_at anterior al aplicado) → no pisa el estado', pendiente);
test('firma inválida → 401; sin FLOWLY_WEBHOOK_SECRET → 503 (falla cerrado)', pendiente);
test('respuesta del agente que falló con 503 → queda queued y /api/cron/flowly la reenvía con la misma llave', pendiente);
test('canal sin activar en canales_proveedor → la entrega queda pendiente y se reprocesa al activarlo', pendiente);
