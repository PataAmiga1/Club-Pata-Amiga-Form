# Plan de trabajo — Observaciones 10/11-ago-2026

> **ESTADO AL CERRAR EL 11-AGO:** planeación cerrada, todas las reglas confirmadas.
> **No se escribió una sola línea de código todavía.** Se para por presupuesto de uso.
> Se retoma con la **Etapa 2.1 fusionada** (ver §4). Nada de lo de abajo requiere
> re-investigarse: las respuestas ya están.

**Fuentes** (en orden de precedencia):
1. `observationspablo.docx` — notas de Pablo. Manda sobre las demás.
2. Transcripción de la junta del 10-ago 18:01 CST.
3. `pmnotes.docx` + audio de WhatsApp del 10-ago 21:44 (respondido por la PM el 11-ago).
4. `Observaciones landing page Pata Amiga_V1` — documento acumulado del equipo.

> ⚠ **Leer junto con `ANEXO-COBERTURA-OBSERVACIONES.md`.** Ese anexo tiene ~20 observaciones
> del documento acumulado del equipo que NO estaban en este plan (auditoría del 11-ago).
> **Antes de cerrar cada fase, recontar contra el anexo.**

**Prioridad del cliente (junta 02:27:02):** 1. Flujos · 2. Estética · 3. Dashboard admin · 4. Extraordinarias
**Método:** por etapas. Cada etapa cierra, Pablo revisa, y hasta entonces sigue la siguiente.
**Despliegue:** push a `staging` → Jorge mergea a `main` → el equipo autoriza tras revisar.
**Versión legible para el equipo:** artefacto publicado (se refresca a pedido).

---

## 1. Reglas de negocio — CERRADAS

### 1.1 Tiempos de espera (confirmado por la PM el 11-ago)

| Caso | Espera |
|---|---|
| **Contratante / titular** | **Ninguna.** Quien compra la membresía se vuelve miembro automáticamente: no requiere aprobación ni tiene tiempo de espera. |
| Mascota, membresía **con código de embajador** (dentro de sus 3 lugares) | 90 días |
| Mascota de raza, no adoptada | 180 días |
| Mascota de raza, adoptada | 150 días |
| Mascota mestiza / doméstica (se asume adoptada) | 120 días |
| Mascota de **reemplazo** | Las condiciones normales (180/150/120) — **sin** el beneficio de embajador |

**El reloj arranca cuando el admin APRUEBA la mascota**, no cuando se registra.
Una mascota pendiente no debe mostrar conteo corriendo.

**El código de embajador es un beneficio POR MEMBRESÍA, no por mascota.** Si alguien
entra con código y da de alta solo 2 mascotas, la tercera —cuando sea que la registre—
sigue recibiendo 90 días. El beneficio **solo** se pierde en una mascota de reemplazo.

#### Lo que hay que BORRAR del sistema
Dos valores existen hoy y según la PM no deben existir:
- `espera_mascota_reemplazo_dias: 180` → el reemplazo ya no es regla propia; cae a las
  condiciones normales sin el atajo de embajador.
- `espera_contratante_dias: 90` → no hay espera para el titular.
  ⚠ **Rastrear dónde se lee antes de quitarlo** — puede estar bloqueando algo distinto
  de los reintegros. Si bloquea otra cosa, avisar antes de tocarlo.

### 1.2 Senior — **Regla X**
**8 años** (antes 10), sin importar raza ni especie. Aplica a **cualquier mascota
registrada desde el cambio**, incluidas las de miembros que ya existían. Las mascotas ya
registradas **no** se recalculan (su estatus vive guardado en la propia mascota).

**Implementación:** poner `edad_senior_anios: 8` en **todas** las versiones de plan.
Publicar solo una versión nueva NO sirve: cada miembro se rige por lo que contrató, así
que un miembro viejo seguiría en 10.

**Respaldo legal (verificado):** los textos legales **no fijan un número**. Difieren a
*"las reglas operativas vigentes publicadas en la Plataforma"*
(`src/data/legal-texts.ts:1096` y `:4784`). Cambiar 10 → 8 no contradice nada de lo
firmado. **Pendiente derivado:** esas reglas deben estar realmente publicadas en algún
lado de la plataforma — hoy no está claro que existan. Empata con lo que pidió Cipatli en
la junta (documentar las reglas por escrito).

### 1.3 Identificación
- Miembros: solo **CURP**, fuera INE.
- Extranjeros: **pasaporte** en vez de CURP (no pueden subir CURP).
- Embajadores: **INE sigue obligatorio**.

### 1.4 Apelaciones
- Embajador: **no** puede apelar un rechazo (riesgo de difamación).
- Centro de bienestar: **sí, una sola vez**, con evidencia de mejoras.

### 1.5 Servicios de centros
Lista **cerrada**, sin campo de texto libre "otro" + nota visible para escribir a
`contacto@pataamiga.mx`. La lista definitiva la debe Lucero, pero **no bloquea**: se quita
el texto libre y se deja la lista actual; cuando llegue la suya se sustituye.
*(El "otro" de Miembros → datos bancarios es la lista de BANCOS, cosa distinta: ese sí lleva "otro".)*

### 1.6 Datos
**No se hace backfill.** Los datos existentes se quedan como están.

---

## 2. Hallazgos técnicos

### 2.1 La espera y la edad senior viven en `planes_versionados`, no en el código
`supabase/migrations/20260728000028_planes_versionados.sql` guarda como JSON del plan:
`espera_contratante_dias`, `espera_mascota_estandar_dias`,
`espera_mascota_adoptada_raza_dias`, `espera_mascota_adoptada_mestizo_dias`,
`espera_mascota_con_embajador_dias`, `espera_mascota_reemplazo_dias`, `edad_senior_anios`.
`src/lib/waiting-period.ts` solo pone los valores por defecto si el plan no trae los suyos.

### 2.2 La espera se GUARDA en la mascota
`pets.waiting_period_end_date` se escribe al registrar. Con la regla nueva (el reloj
arranca al aprobar), **el punto de escritura tiene que moverse al momento de la aprobación**.

### 2.3 🔴 Dos juegos de columnas de espera — sospechoso del bug de los 13 días
| Migración | Columnas |
|---|---|
| `20260210_add_pet_fields.sql` | `waiting_period_start`, `waiting_period_end` (timestamptz), comentario *"90 days after start"* |
| `20260713000001_initial_schema.sql` | `waiting_period_end_date` (date) |

Si la pantalla lee un juego y el alta escribe el otro, sale exactamente la basura
reportada (13 días en una mascota de menos de 24 h). **Primera hipótesis a verificar.**

---

## 3. 🔴 Diagnóstico que cambió el plan — leer antes de programar

**Las etapas 1.1 (contraseñas) y 2.1 (flujo de embajador) son el mismo problema.**

**Evidencia recogida el 11-ago:**
- `supabase.auth.signUp` aparece en **un solo archivo**: `src/app/registro/page.tsx:41`
  (flujo de miembro).
- `admin.createUser` **no aparece en ningún lado** de `src/`.
- La carpeta `src/app/centros/registro/` **no tiene campo de contraseña** (cero
  coincidencias de `password`).
- `src/app/embajadores/actions.ts:65` solo llama a `getUser()` para amarrar la solicitud a
  una sesión **si ya existe**. Nunca crea una.

**Causa raíz: a embajadores y centros nunca se les crea cuenta al aplicar.**
De ahí salen los tres síntomas reportados:

| Síntoma reportado | Causa real |
|---|---|
| "No llega el correo de recuperación" | `resetPasswordForEmail` sobre un correo sin cuenta devuelve éxito en silencio y no manda nada — comportamiento anti-enumeración de Supabase, funcionando como debe |
| "Dice contraseña incorrecta al volver" | Nunca se creó cuenta con esa contraseña |
| "Me manda al flujo de miembro y a verificar el correo otra vez" | El alta de miembro es el único camino que crea cuenta |

**No hay bug de recuperación que arreglar.** No se puede recuperar la contraseña de una
cuenta que no existe. El diseño actual es deliberado (`CLAUDE.md` lo documenta: las
solicitudes sin sesión se ligan por correo al entrar) y es justo lo que el cliente dice
que está mal.

---

## 4. Por dónde se retoma — Etapa 2.1 FUSIONADA

Cerrar de un golpe las cuentas muertas y el flujo de embajador.

1. Campo de contraseña en el formulario de embajador y en el de centro.
2. **Crear el usuario de auth al enviar la solicitud** y amarrar la solicitud a ese usuario.
3. Caen a su portal en estado **pendiente**: áreas grises y bloqueadas, perfil editable
   (RRSS, datos bancarios, fotos).
4. Aprobado desbloquea · rechazado muestra el motivo (embajador sin apelación, centro con
   una apelación).
5. **Las solicitudes viejas sin cuenta ya NO preocupan:** todo lo que hay en staging son
   cuentas de prueba, no reales (confirmado por Pablo el 11-ago). Se construye sin cargar
   con esa migración.
   *Nota para el día del despliegue:* antes de que esto llegue a producción, revisar si
   allá hay solicitudes reales de embajador o centro sin cuenta amarrada. Consulta de un
   minuto, pero se hace en su momento.

**Campos del formulario de embajador:** Nombre(s) · Apellido paterno · **Apellido materno**
(falta) · CP que autocompleta colonia y alcaldía/municipio, editable · "Ciudad, alcaldía o
municipio" (una variable, la etiqueta menciona las tres) · teléfono a **10 dígitos** ·
**al menos una red social obligatoria** (Facebook, TikTok, Instagram, YouTube) · contraseña ·
fecha de nacimiento (**alinear la caja**) · CURP validado · motivación · banco, CLABE, RFC · INE.

**Se pueden meter de paso:** la pantalla de confirmación de recuperación cortada en móvil,
y el límite de 10 dígitos en todos los teléfonos.

### ⏳ Pendiente atado a Jorge: apagar "Confirm email"
Jorge lo apaga la noche del 11-ago. **Hoy no bloquea nada de la 2.1** — embajadores y
centros entran igual porque su cuenta se crea con `email_confirm: true`.

**Cuando Jorge confirme que ya está apagado, hay que volver aquí:**
1. Cambiar `email_confirm: true` → `false` en `src/app/embajadores/actions.ts` y
   `src/app/centros/registro/actions.ts`. Hoy está en `true` **a propósito**: si se
   pusiera en `false` antes de que Jorge lo apague, cada nuevo embajador quedaría
   bloqueado sin poder entrar.
2. Mandar el correo de verificación por separado, para que se pueda completar después
   sin trabar el acceso (que es justo lo que pidió Pablo).
3. Recién entonces se puede hacer la **Fase 2.2** (registro de miembro sin que la
   verificación trabe): eso NO se puede arreglar por código con el ajuste encendido.

### Orden del resto de la Fase 1 (intacto, no depende de lo anterior)
- **1.2** Conteo de días de espera + arranque al aprobar (verificar primero §2.3)
- **1.3** Senior a 8 en todas las versiones de plan (Regla X)
- **1.4** Lógica nueva de espera: quitar el 180 fijo de reemplazo, mover el beneficio de
  embajador a nivel membresía, quitar la espera del contratante

> Si se quiere una victoria autocontenida y corta, **1.3 es la más pequeña y la más visible.**

---

## 5. Fase 2 — resto de flujos

**Miembro:** correo + contraseña + teléfono → **la verificación de correo NO bloquea el
avance** → alta de mascota completa → plan con sugerencia de código de embajador → popup
"Bienvenida a la manada". Tras confirmar el pago: datos de propietario (nombre, CP) y
complementarios de la mascota (color de ojos, nariz, pelaje, fotos) **antes** de entrar de
lleno al dashboard. Se construye **como lo piden hoy**, sin arqueología del repo viejo
(decisión de Pablo). Quitar INE; extranjeros suben pasaporte. La leyenda "completar
documentos" pasa a **"en revisión"** si el usuario ya subió todo.

**Centros:** login con solicitud pendiente · "volver al directorio" cierra la sesión (bug) ·
apelación una vez · "Nombre completo de contacto" · teléfono 10 dígitos · faltan RRSS ·
servicios de lista cerrada · el mensaje de "solicitud recibida" queda muy arriba y la
pantalla se ve blanca.

---

## 6. Fase 3 — Estética, copy y catálogos
Popup de legales (todos los documentos dentro, no descargable, no navega fuera) ·
CP: "Distrito Federal" → **Ciudad de México**, "Ciudad" → **Alcaldía o Municipio**, colonia
cortada · banda: **"peludos"** · teléfonos a 10 dígitos · "denegadas" → **"rechazadas"** ·
"factura" → **"comprobante de pago"** · razas sin separar párrafos ·
**🔴 BARRIDO DE FOTOS CORTADAS — ninguna foto se corta, en ningún lado** (decisión de Pablo,
11-ago). No es solo la de la mascota: también foto de perfil del miembro, fotos del negocio
y de las sucursales de los centros, materiales del embajador y cualquier avatar o
miniatura. Encuadre correcto (`object-fit` / `object-position`) en escritorio **y** en móvil
375px · **🔴 EL ESPEJO DE SEPOMEX ESTÁ MUERTO (hallazgo del 11-ago).**
`sepomex.icalialabs.com` **ya ni siquiera resuelve en DNS** — no es una caída
pasajera. Por eso TODAS las búsquedas de CP (embajador y centro) caen desde hace
quién sabe cuánto en el respaldo `zippopotam`, que **no trae municipio** (de ahí que
la alcaldía/municipio no se autocomplete) y devuelve nombres viejos de estado
("Distrito Federal"). Los dos síntomas que reportó el equipo salen de la misma causa.
· ✅ **Ya arreglado:** normalización de estados en `/api/sepomex` — DF y variantes
salen como **Ciudad de México** (verificado: CP 01000 → "Ciudad de México").
· ❌ **NO se puede arreglar sin datos propios:** la alcaldía/municipio. Ninguna
fuente gratuita viva la trae. **Esto sube de prioridad la tarea "Sepomex a tabla
propia"** — ya no es prevención, es lo único que devuelve ese campo.
· Menor: zippopotam devuelve estados sin acento ("Nuevo Leon"). Se puede normalizar
cuando se tenga el catálogo propio.

**Google Maps no carga** en dirección (miembro y centros) → revisar API
key y restricciones de dominio · favicon (Jorge) · tono (esperan a Fer Fierro).

---

## 7. Fase 4 — Dashboard admin (prioridad 3)
**Menú:** Resumen · Notificaciones · Miembros · Mascotas · Embajadores · Centros de
bienestar · Reintegros · Apelaciones *(super admin)* · Finanzas *(super admin)* · Vet ·
Conversaciones · Marketing — con contador en Notificaciones.

- 🔴 **Notificaciones al detalle**, no a la lista general.
- **Miembros:** separar pagaron-activos / pagaron-inactivos / **registrados que nunca
  pagaron** (tabla aparte). Estado del pago, próximo pago, CLABE, "otro" en bancos,
  historial del peludo, fecha de solicitud, estado de información, fecha de nacimiento,
  nacionalidad, nombre completo. Filtros y contadores. Super admin puede editar. Motivos de baja.
- **Mascotas:** más reciente primero + filtro · aprobar/rechazar desde el listado · popup
  con foto, color de nariz y ojos, historia de rescate, certificado y espera por mascota.
- **Embajadores:** fecha de nacimiento, motivación, banco/CLABE/RFC, RRSS · más reciente
  primero · **tablero dinámico del ADMIN** (referidos, ganancias totales, ganancias del mes
  por cobrar, historial de pago, aprobar/rechazar). *No es un tablero del embajador.*
- **Centros:** contacto, email, sitio web, beneficio ofrecido, otras sucursales, RRSS,
  fotos, aprobar/rechazar, apelación en filtros.
- **En todos los popups:** mostrar qué datos faltan del perfil.
- **Reintegros/Finanzas:** filtros tipo Excel · separar miembro y mascota · apelaciones
  (super admin) · botón pagos a centros de bienestar · campo cancelaciones con motivo ·
  filtro de solicitantes de factura.

---

## 8. Fase 5 — Correos (bloqueada por los buzones)

| Sección | Correo |
|---|---|
| Landing y general | `contacto@pataamiga.mx` |
| Dashboard miembro | `miembros@pataamiga.mx` (**plural**) |
| Dashboard embajador | `embajador@pataamiga.mx` |
| Red de bienestar | por definir — mientras, `contacto@` |
| Agente veterinario | `apoyoveterinario@pataamiga.mx` |

**Lo que dice el DNS de `pataamiga.mx` (consultado el 11-ago):**
- **MX → `smtp.google.com`**: los buzones viven en **Google Workspace**. Crearlos es en el
  admin de Google, no en Vercel.
- **Resend ya está verificado** (`resend._domainkey` + `send.pataamiga.mx` → amazonses).
  La plataforma **ya puede enviar** desde `@pataamiga.mx`. Nunca estuvo bloqueado.
- ⚠ **El SPF de la raíz quedó del hosting anterior:**
  `v=spf1 include:_spf.mail.hostinger.com ~all` — **no incluye a Google**. Cualquier correo
  que una persona mande o responda desde Gmail con esas direcciones falla SPF y puede caer
  en spam.
- El DNS se edita **en Vercel**. **El MCP de Vercel NO sirve para esto** — sus herramientas
  de dominio son solo de compra (`buy_domain`, `check_domain_availability_and_price`,
  `get_domain_order`), no hay CRUD de registros DNS. Se hace a mano en el panel.

**Arreglo del SPF (lo hace Pablo — pendiente al cerrar el 11-ago):**
editar el TXT de la raíz (no agregar uno nuevo; solo puede haber un `v=spf1` o falla todo) a
`v=spf1 include:_spf.google.com include:_spf.mail.hostinger.com ~all`,
y en ~2 semanas recortarlo a `v=spf1 include:_spf.google.com ~all`.

Después: inventariar **todos** los correos que salen y confirmar que van branded · arreglar
el diseño del correo de embajador · agregar mailing de documentación faltante.

---

## 9. Fase 6 — Al final
- **Mascota duplicada** tras el pago (2× en "ir a mi manada", "mis peludos" y "vet 24/7").
  Cipatli no la pudo replicar → se ataca al final, con tiempo para reproducirla.
- Cancelar/eliminar cuenta debe **cancelar también la renovación en Stripe**, con prueba
  cotejada contra Stripe.
- Reintegros puntuales: manuales vía Stripe por ahora.

---

## 10. Fuera de nuestras manos
| Qué | Quién | Estado |
|---|---|---|
| **SPF en Vercel** | **Pablo** | pendiente al cerrar el 11-ago |
| Crear los buzones en Google Workspace | Admin de `pataamiga.mx` (cuenta `gbtravel.com.mx`) | pendiente |
| Supabase a Pro + renombrar + transferir propiedad | Jorge / equipo | pendiente |
| Favicon | Jorge | pendiente |
| Lista de servicios de centros | Lucero | no bloquea |
| Tono con Fer Fierro | Cipa | pendiente |
| Estado del pago de Memberstack | Jorge | riesgo abierto |
| 60 miembros migrados sin método de pago | — | **falsa alarma**, era el ambiente de pruebas |

---

## 11. Pasos de Pablo en Vercel

> El **MCP de Vercel NO sirve para DNS** — sus herramientas de dominio son solo de compra
> (`buy_domain`, `check_domain_availability_and_price`, `get_domain_order`). No hay CRUD de
> registros. Se hace a mano en el panel.

### A · Arreglar el SPF 🔴 — **se hace en CLOUDFLARE, no en Vercel**

> ⚠ **Corrección del 11-ago.** El DNS de `pataamiga.mx` **no vive en Vercel**. Verificado:
> `NS = earl.ns.cloudflare.com / rose.ns.cloudflare.com`, SOA de Cloudflare. Los registros A
> apuntan a las IPs de Vercel y `www` es CNAME a `vercel-dns`, pero **apuntar registros a
> Vercel no es lo mismo que alojar la zona ahí**. Por eso la página Domains del equipo sale
> vacía y la del proyecto solo asigna/redirige dominios: Vercel no tiene editor de DNS
> porque no tiene la zona.

1. Entrar a **Cloudflare** → dominio `pataamiga.mx` → **DNS → Records**.
2. Buscar el **TXT** de la raíz (nombre `pataamiga.mx` o `@`) que empieza con `v=spf1`.
   Hoy dice: `v=spf1 include:_spf.mail.hostinger.com ~all`
3. **Editar ESE registro. NO crear uno nuevo** — solo puede haber un `v=spf1` por dominio;
   con dos, el SPF falla para todo y queda peor que ahora.
4. Reemplazar por: `v=spf1 include:_spf.google.com include:_spf.mail.hostinger.com ~all`
   *(aditivo: agrega Google sin quitar nada, así no se rompe si algo aún manda por Hostinger)*
5. Guardar. Propaga en minutos. **No tocar** `send.pataamiga.mx` ni `resend._domainkey`
   ni los registros MX.
6. En ~2 semanas, si nada se rompió, recortar a `v=spf1 include:_spf.google.com ~all`.

**Verificación:** avisar y se consulta el DNS para confirmar que quedó.

**🔴 Pregunta nueva que esto abre: ¿quién tiene acceso a Cloudflare?** No está en el mapa de
accesos del handoff (ahí el dominio figura como "por confirmar"). Sin ese acceso, el SPF no
se puede arreglar y los buzones de Google seguirán mandando a spam.
*(Existe un conector de Cloudflare para Claude; si lo autorizan, el cambio se podría hacer
desde aquí.)*

### B · Variables de entorno de producción ✅ CERRADO (11-ago)
`NEXT_PUBLIC_MEMBERSTACK_PUBLIC_KEY` está bien configurada en producción (verificado por
Pablo). El puente legacy de los ~443 miembros migrados **no** está en riesgo por esta vía.

### C · Dominios ✅ CERRADO (11-ago)
El proyecto `club-pata-amiga-form` tiene 6 dominios, pero **solo `www.pataamiga.mx` sirve
la app**. Verificado con curl el 11-ago:

| Dominio | Resultado |
|---|---|
| `pataamiga.mx` (ápice) | 308 → `www.pataamiga.mx` |
| `app.pataamiga.mx` | 308 → `www.pataamiga.mx` |
| `www.pataamiga.mx` | **200 — sirve directo** |

**Consecuencia:** en los Redirect URLs de Supabase basta **una sola entrada**,
`https://www.pataamiga.mx/auth/callback**`. No hacen falta entradas para el ápice ni para
`app.`. Se cierra la preocupación que se levantó al configurar el login con Google.

### D · 🔴 El trial de Vercel — URGENTE, no lo puede hacer Pablo
Visto el 11-ago en el panel: **"2 days remaining of Pro trial"**, crédito incluido
$1.47/$20 y **sin método de pago cargado**. El aviso dice *"contact your account owner to
upgrade"* → **Pablo no es el owner**; le toca a `clubpataamiga@gbtravel.com.mx`.

Al caducar vuelve el límite de tareas programadas y **el despliegue truena**. Es un riesgo
mayor que cualquier cosa de la Fase 1. Escalar al owner de inmediato.

---

## 11-bis. 🔴 ORDEN OBLIGATORIO para el merge a producción

Antes de que Jorge mergee `staging` → `main`, hay que correr EN PRODUCCIÓN
(SQL Editor del proyecto live) las migraciones del 11-ago **en este orden**:

1. `20260811000001_embajador_campos_registro.sql`
2. `20260811000002_catalogo_sepomex.sql`
3. `20260811000003_espera_arranca_al_aprobar.sql`
4. `20260811000004_senior_regla_global.sql` *(limpieza de datos, segura)*
5. `20260811000005_contratante_sin_espera.sql` *(limpieza de datos, segura)*
6. `20260811000006_pasaporte_documento.sql` *(valor 'passport' en el enum — sin él, subir pasaporte truena)*

**Por qué es obligatorio:** el código nuevo consulta columnas que estas
migraciones crean. Se comprobó en staging el 11-ago: con el código nuevo y sin
la migración 3, **todos los miembros ven cero mascotas** (el select truena en
silencio). Las tres son aditivas (`if not exists`) — no tocan ni borran datos.

Aparte y SIN urgencia: el **import de los 158,034 CP** a la tabla
`postal_codes` de producción. Si falta, no rompe nada — la ruta cae a las
fuentes externas como hoy (sin alcaldía). Se corre con el script del repo
cuando se quiera.

---

## 12. Lo único que sigue abierto
- **¿Hostinger todavía manda algún correo?** Define si al arreglar el SPF se quita o se deja.
- **¿Quién administra `pataamiga.mx` en Google Workspace?** Ahí se crean los buzones.
- **¿Dónde se lee `espera_contratante_dias`?** Rastrear antes de quitarlo — lo hago yo al
  empezar la etapa 1.4.
