# Agentes IA — guía de conexión (para el equipo de desarrollo)

Hay dos agentes IA en la plataforma. **Todo el código ya está construido y
probado**; lo único pendiente es conectar las cuentas del cliente vía
variables de entorno. Busca `CONECTAR:` en el código para ver cada punto de
enlace.

| Agente | Dónde vive | Qué hace |
| --- | --- | --- |
| **Asistente de soporte** | Widget flotante en `/app` (portal de miembros) | Responde dudas de membresía, reintegros y períodos de espera con datos reales del miembro (herramientas sobre Supabase con RLS) |
| **Agente de ventas** | Messenger, Instagram DM y WhatsApp | Responde mensajes directos al público, invita a unirse; el equipo supervisa y toma conversaciones en `/admin/conversaciones` |

Extras del agente de ventas:

- **Pipeline de ventas** en `/admin/conversaciones`: cada conversación tiene
  etapa (Nuevo → Interesado → Convertido → Descartado · Soporte para no-ventas).
  La IA la clasifica sola con su herramienta `clasificar_conversacion`; el
  equipo puede corregirla en el hilo. Las tarjetas de arriba filtran por etapa.
- **Escalación automática**: si un mensaje trae señales de molestia, petición
  de humano o amenaza legal (o la IA lo detecta), la conversación se marca ❗
  y se avisa por correo al equipo (destinatarios en /admin/sitio →
  Notificaciones → "Conversación de redes necesita atención").
- **Voz de marca compartida** (`src/lib/llm/brand-voice.ts`): tono, adaptación
  de ánimo y límites legales/médicos idénticos para los tres agentes. Está en
  código a propósito — no debe poder borrarse desde el panel.

Ambos comparten la capa de proveedor `src/lib/llm/` (swappable: `mock` en
desarrollo, `anthropic` en producción) y respetan la terminología vinculante
(reintegro, período de espera — nunca seguro/póliza/cobertura/carencia).

---

## 1. Conectar la IA (Anthropic)

1. Crear una cuenta de API en https://platform.claude.com con la cuenta del
   cliente y generar una API key.
2. Configurar en el entorno (local `.env.local` y Vercel → Settings →
   Environment Variables):

```bash
LLM_PROVIDER=anthropic          # sin esta variable se usa el mock de desarrollo
ANTHROPIC_API_KEY=sk-ant-...    # la key del cliente — NUNCA commitearla
# Opcional: LLM_MODEL=claude-opus-4-8   (default; se puede bajar de tier si el volumen crece)
```

3. Listo — el asistente del portal y el agente de ventas quedan activos.
   Sin key, ambos funcionan en "modo demo" (respuestas predefinidas que sí
   consultan la BD, marcadas con 🛠️).

**Costo aproximado:** centavos por conversación (el system prompt va con
caché). Monitorear el uso en la consola de Anthropic el primer mes.

**Conocimiento editable sin deploy:** en `/admin/conversaciones` →
"Conocimiento de los agentes IA" hay dos herramientas:

- **Promociones y material rotativo** (tabla `agent_promos`): entradas con
  vigencia (desde/hasta) y agente destino; los agentes las mencionan solo
  mientras están vigentes y al vencer dejan de usarse solas.
- **Instrucciones adicionales**: texto permanente que se anexa a las
  instrucciones de cada agente (respuestas frecuentes, políticas, tono).

---

## 2. Conectar Messenger + Instagram + WhatsApp (Meta)

Requisitos: acceso admin a la página de Facebook / cuenta de Instagram
profesional del cliente y a https://developers.facebook.com con su cuenta de
empresa (Business Manager verificado).

### 2.1 Crear la app de Meta

1. developers.facebook.com → Create App → tipo "Business".
2. Agregar los productos **Messenger**, **Instagram** y **WhatsApp**.
3. App Review: solicitar los permisos `pages_messaging`,
   `instagram_manage_messages` y acceso a WhatsApp Cloud API. (Esto tarda
   1–3 semanas; mientras, todo funciona con cuentas de prueba.)

### 2.2 Registrar el webhook

- **Callback URL:** `https://<dominio>/api/canales/meta/webhook`
- **Verify token:** inventa una palabra secreta y ponla igual en Meta y en la
  variable `META_VERIFY_TOKEN`.
- Suscribirse al campo **messages** en los tres productos (Página, Instagram
  y WhatsApp).

### 2.3 Variables de entorno

```bash
META_VERIFY_TOKEN=una-palabra-secreta-inventada
META_APP_SECRET=...              # App → Settings → Basic → App Secret (firma de webhooks)
META_PAGE_ACCESS_TOKEN=...       # token de la página (Messenger + Instagram)
WHATSAPP_PHONE_NUMBER_ID=...     # WhatsApp → API Setup → Phone number ID
WHATSAPP_ACCESS_TOKEN=...        # token de sistema (System User) con permiso whatsapp_business_messaging
NEXT_PUBLIC_SITE_URL=https://pataamiga.mx   # el agente de ventas manda a la gente aquí
```

Sin estas variables, el webhook igual guarda los mensajes en la bandeja
(`/admin/conversaciones`) y la IA genera la respuesta, pero **no se envía** al
canal y la bandeja lo avisa.

**`META_APP_SECRET` es obligatorio para recibir mensajes.** Sin él, el webhook
rechaza TODO con 401 (falla cerrado) y lo avisa una vez en los logs: un POST sin
firma crearía contactos y oportunidades y haría gastar al agente de ventas. La
única excepción es el desarrollo local: con `NODE_ENV` distinto de
`production` **y** `META_WEBHOOK_ALLOW_UNSIGNED=1` se aceptan sin firma. En
Vercel (producción y pruebas) `NODE_ENV` es `production`, así que ahí la
excepción no aplica nunca. El alta del webhook (GET con `hub.verify_token`) no
depende del secreto y sigue igual.

### 2.4 Reglas de Meta a tener en cuenta

- **Ventana de 24 horas:** solo se puede responder texto libre dentro de las
  24 h siguientes al último mensaje del contacto. Fuera de esa ventana,
  WhatsApp exige plantillas aprobadas (no implementado aún — el envío
  simplemente fallará y quedará registrado en la bandeja).
- Los webhooks de Meta se reintentan: el código deduplica por
  `external_message_id`, no hay que hacer nada.

### 2.5 Probar sin Meta (curl)

```bash
# Simula un mensaje entrante de Messenger — crea la conversación, la IA
# responde y todo aparece en /admin/conversaciones:
curl -X POST http://localhost:3000/api/canales/meta/webhook \
  -H "Content-Type: application/json" \
  -d '{"object":"page","entry":[{"messaging":[{"sender":{"id":"TEST-123"},"message":{"mid":"m-1","text":"Hola, ¿cuánto cuesta la membresía?"}}]}]}'
```

---

## 2.6 Otros conectores nuevos

- **Autocompletado de direcciones (Google Places)** — `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`.
  CONECTAR: en Google Cloud del cliente, habilitar *Places API* y *Maps JavaScript API*,
  crear una API key restringida por dominio (referrer). Sin la llave, los campos
  de dirección funcionan como texto normal (sin dropdown). Usado en el registro
  de centros de bienestar (`AddressAutocomplete`).
- **Cron de cumpleaños** — `CRON_SECRET` + `vercel.json` (crons). Envía correos
  brandeados de felicitación a miembros y mascotas el día de su cumpleaños. En
  Vercel el cron se autentica solo; el secreto es para llamadas manuales.

## 3. Mapa del código

| Pieza | Archivo |
| --- | --- |
| Capa de proveedor LLM (mock/anthropic, bucle de herramientas) | `src/lib/llm/` |
| Herramientas del asistente (datos del miembro vía RLS) | `src/lib/llm/support-tools.ts` |
| Prompts (soporte y ventas, terminología vinculante) | `src/lib/llm/support-prompt.ts`, `sales-prompt.ts` |
| API del asistente del portal | `src/app/api/asistente/chat/route.ts` |
| Widget del asistente | `src/components/app/AsistenteWidget.tsx` |
| Conector Meta (envío + firma + parseo de webhooks) | `src/lib/channels/meta.ts` |
| Webhook de canales | `src/app/api/canales/meta/webhook/route.ts` |
| Bandeja de admin + tomar conversación | `src/app/admin/conversaciones/` |
| Tablas (asistente + canales, RLS) | `supabase/migrations/20260719000017_asistente_ia_canales.sql` |
