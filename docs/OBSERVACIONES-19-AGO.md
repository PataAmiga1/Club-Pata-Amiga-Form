# Observaciones del equipo, 19 de agosto — plan y handoff

Cuatro grupos de observaciones de la junta, con las respuestas de Pablo ya
incorporadas. **Este documento es el punto de partida para retomar en otra
sesión:** trae lo decidido, lo verificado, el plan por fases y lo que queda
abierto.

---

## ⭐ Avance al 25-ago

| Fase | Estado | Commit |
|---|---|---|
| 1 · «Rechazado» → «Denegado» | ✅ construida y verificada | `ea3ddad` |
| 2 · Centros: pestañas, menú móvil y gráfica | ✅ construida y verificada | `5497470` |
| 3 · Documentos en conversaciones | pendiente | — |
| 4 · Ligas en correos | pendiente | — |
| 5 · Persona física o moral | pendiente | — |

Las dos están en `staging` y desplegadas en pruebas. Ninguna lleva migración,
así que **Jorge no tiene nada nuevo que correr** por estas dos.

### Tres correcciones a este documento, encontradas al construir

1. **La fase 1 no eran 27 apariciones sino 74** de `rechaz*` en `src/` fuera de
   los legales; unas 35 son texto visible y el resto comentarios. Y **no todas
   se cambian**: «Pago rechazado» del webhook de Stripe es una tarjeta
   declinada, no una resolución del comité, y los errores de terceros («Stripe
   rechazó el cupón», «Resend rechazó el lote», «Meta rechazó la plantilla») son
   español correcto sobre otra cosa. Se dejaron.
2. **La tabla de pagos es `center_payments`**, no `wellness_center_payments`.
   Esa segunda existe (migración de mayo) pero **no la usa ningún código**. Si
   alguien planea sobre ella, planea sobre una tabla muerta.
3. **`/app/apelaciones` no existe.** La fase 4 manda ahí tres plantillas
   (`appeal_received`, `appeal_accepted`, `appeal_rejected`) y hoy sería un 404:
   las apelaciones viven dentro del peludo o del reintegro (`AppealButton`), no
   en un listado propio. **Hay que decidirlo antes de construir la fase 4**:
   o las tres ligas van al detalle del sujeto apelado, o se construye el
   listado. Es la única duda abierta que queda.

### Datos de prueba que quedaron en staging

Para verificar la gráfica se registraron **5 pagos de prueba** al centro
`centro@pataamiga.dev` desde `/admin/centros/pagos` (total $10,100; $9,400
dentro de la ventana de 12 meses). Sirven para que el equipo vea la gráfica con
datos. Uno trae una nota equivocada —dice «fuera de los 12 meses» y sí está
dentro—; se puede corregir o borrar desde la base cuando estorbe.

---

Lo demás **no está construido todavía**. Lo que ya se había hecho el 19-ago es
la carpeta de correos (`correos-plataforma/` en la carpeta de consultoría) y el
botón de regreso del tablero de ventas (commit `93b37a2`).

---

## Lo que se verificó antes de planear

Tres hallazgos que cambian el trabajo respecto de cómo se planteó en la junta:

1. **Los 23 correos de la plataforma YA vienen con la marca.** Todos pasan por
   el mismo cascarón (`WRAP` en `src/lib/email/templates.ts`) y producción no
   tiene ninguna plantilla sobreescrita. El correo sin marca que vio el equipo
   es casi con seguridad **el de confirmación de Supabase**, que sale con la
   plantilla de fábrica porque las nuestras nunca se han pegado en el panel.
   → No hay que programar nada: hay que pegar 3 archivos. Ver
   `correos-plataforma/LEEME.md`.

2. **Los centros no piden hoy ni un documento de identidad.** Ni CURP, ni INE,
   ni RFC — solo nombre, contacto y dirección. Al embajador sí se le piden CURP
   e INE por ambos lados. Verificamos a quien comparte un código y no al negocio
   que publicamos y al que mandamos miembros.

3. **De 23 plantillas de correo, solo 3 llevan liga a la plataforma.** El resto
   solo trae los iconos de redes en el pie. La mejor de las tres,
   `pet_info_request`, ya tiene un boton con la marca y URL por variable: es el
   modelo a copiar, no hay que inventarlo.

Y dos datos de estructura que ahorran trabajo:

- Ya existe una tabla **`documents`** (`user_id`, `pet_id`, `document_type`,
  `file_path`, `file_name`, `file_size`, `mime_type`). Le faltan las columnas de
  revisión, pero **no hay que inventar una tabla nueva**.
  Tipos actuales del enum: `ine_front`, `ine_back`, `proof_of_address`,
  `vet_certificate`, `reimbursement_invoice`, `vet_report`, `death_certificate`,
  `passport`.
- **`appeals` ya resuelve adjuntos** (columna `documents jsonb` + bucket
  `appeal-documents` + 2 políticas). Es el patrón a copiar para los otros hilos.

---

## Decisiones de Pablo

| # | Tema | Decisión |
|---|---|---|
| 1.1 | Documentos de persona moral | **RFC basta como base**, sin acta constitutiva. Ver la recomendación abajo |
| 1.1b | Representante | Popup después del RFC avisando que un representante debe subir sus datos |
| 1.2 | CURP y 18+ en persona moral | Se piden **del representante legal** |
| 1.3 | Alcance | **Embajadores Y centros**, los dos |
| 1.4 | CLABE | Libre. El comité revisa que cuadre con la razón social |
| 1.5 | Revisión | **Documento por documento**, no todo junto |
| 2.1 | Pestañas del centro | Espejo del embajador: **Resumen · Promociones · Pagos · Mi cuenta** |
| 2.2 | Tanatología | **Se descarta.** No se agrega la categoría |
| 2.3 | Gráfica de pagos | Sí, mensual, de barras como las del panel |
| 3.1 | Rechazado → Denegado | **En todo**: peludos, reintegros, apelaciones, embajadores y centros |
| 3.2 | Textos legales | Se dejan fuera. Se le anotan al despacho |
| 4.2 | Adjuntos en conversaciones | **Los dos hilos**, y **pueden adjuntar ambas partes** |
| 4.3 | Ligas en correos | Decidido: reintegro denegado va **al detalle**; embajador y centro denegados van **sin liga**; **si se pasa el id** a las que lo necesitan |

### Por qué el RFC basta y el acta constitutiva no

La recomendación fue no pedir acta constitutiva en el alta, y conviene dejar
escrito el razonamiento porque es una decisión que se va a re-preguntar:

- **La constancia de situación fiscal ya prueba lo que importa**: que la entidad
  existe, está registrada ante el SAT, y trae razón social y domicilio fiscal.
- **El acta es desproporcionada para el riesgo.** Son treinta y tantas páginas
  que una clínica chica rara vez tiene escaneadas. Pedirla en el alta mata la
  conversión de justo el perfil que queremos sumar.
- **El riesgo real ya queda cubierto** con RFC + identificación del representante
  + la revisión de CLABE contra razón social que hace el comité.
- **Y si algo no cuadra, se pide después.** Justo estamos construyendo que el
  comité pueda solicitar documentos dentro de la conversación (fase 3). Documentos
  base en el alta, documentos excepcionales a petición. Las dos piezas se
  complementan.

> Si el despacho dice que para poder ejecutar un contra una persona moral hace
> falta el acta y el poder notarial en expediente, esto se revisa. Es pregunta
> legal, no técnica.

---

## El plan, por fases

Ordenadas por relación entre esfuerzo y valor. Las fases 1 a 4 son
independientes entre sí; la 5 conviene al final porque se apoya en la 3.

### Fase 1 · «Rechazado» → «Denegado» — media jornada

**Alcance:** 27 apariciones visibles en `src/`, excluyendo `src/data/legal-texts.ts`.

**Qué NO se toca:** los valores de la base siguen siendo `rejected`. Es cambio de
etiqueta, no de datos. Tocar el estado rompería consultas, filtros y el histórico.

**Dónde está:** `app/apelaciones/actions.ts` (5), `admin/apelaciones/page.tsx` (4),
`components/app/AppealButton.tsx` (3), `admin/reintegros/page.tsx` (2),
`admin/page.tsx` (2), `admin/mascotas/page.tsx` (2), `admin/centros/page.tsx` (2),
`lib/reimbursement-balance.ts`, `lib/login-destination.ts`,
`components/app/PetCard.tsx`, `centro/page.tsx`.

**Cuidado con el género:** «rechazada» → «denegada», «rechazado» → «denegado».
Es el mismo tipo de trampa que dejó «su perfil sea aprobada» en agosto.

**Verificación:** entrar como miembro con un peludo denegado y como admin, y
comprobar que no queda ningún «rechaz» visible fuera de los legales.

---

### Fase 2 · Centros: pestañas, menú móvil y gráfica de pagos — 1 jornada

Hoy `/centro` es **una sola pantalla larga sin menú**. El portal del embajador ya
tiene pestañas y barra inferior en móvil (`AmbassadorNav.tsx`, con
`fixed inset-x-0 bottom-0 … sm:hidden`). Se copia ese patrón.

**Pestañas:** Resumen · Promociones · Pagos · Mi cuenta.
Reparto de lo que ya existe:

| Pestaña | Qué se mueve ahí |
|---|---|
| Resumen | Tarjeta del directorio (foto, beneficio, teléfono, sitio), servicios y sucursales |
| Promociones | Alta, pausa y borrado — el bloque que ya existe |
| Pagos | El bloque «Pagos de Pata Amiga» **+ la gráfica nueva** |
| Mi cuenta | Redes sociales, cambiar contraseña, darse de baja |

**La gráfica:** barras mensuales de los últimos 12 meses con `MiniBarChart`
(`src/components/panel/MiniBarChart.tsx`), sumando `amount` de
`wellness_center_payments` agrupado por mes de `paid_at`.

**Sin migración.** La tabla ya tiene `concept`, `amount`, `paid_at`, `notes`.

⚠ **Ojo con la zona horaria:** agrupar por mes con `inicioDelMes()` y
`diaEnMexico()` de `src/lib/zona-horaria.ts`, nunca con `new Date()`. En Vercel el
proceso corre en UTC y el último día del mes se va al mes siguiente.

**Se descartó Tanatología** (decisión 2.2). Las categorías siguen siendo 9.

---

### Fase 3 · Documentos dentro de las conversaciones — 2 a 3 jornadas

**El hueco:** `pet_messages` y `reimbursement_messages` **no aceptan archivos**.
Sus columnas son `id, pet_id/reimbursement_id, sender, author_id, message,
[requested_items,] created_at`. Solo `appeals` resuelve adjuntos.

Es especialmente absurdo en `pet_messages`, que **ya tiene `requested_items`**: el
comité pide documentos específicos y el miembro no tiene dónde entregarlos.

**Qué hacer:**

1. **Migración**: `documents jsonb not null default '[]'` en `pet_messages` y en
   `reimbursement_messages`, con el mismo formato que `appeals`:
   `[{path, name, type}]`.
2. **Bucket** privado nuevo (`conversacion-documentos`) con las dos políticas
   copiadas de `appeal-documents`: subir solo a la carpeta propia, leer el dueño
   o un admin.
3. **UI en las dos direcciones** (decisión 4.2): el miembro adjunta desde el hilo
   del peludo y del reintegro; **el comité también puede adjuntar**.
4. La liga se firma al pintar, como en `documentos-ine.ts` — nunca URL pública.

⚠ **Lleva `notify pgrst, 'reload schema'`** al final: agrega columnas y sin
recargar, PostgREST no las ve y las consultas fallan con 400, que se lee como
«no hay datos» en vez de como error.

---

### Fase 4 · Ligas de acción en los correos — 2 jornadas

**20 de 23 plantillas no llevan liga** a la plataforma. Las tres que sí:
`welcome` (→ `/app/perfil`), `campaign_gift` (→ `/registro`) y
**`pet_info_request`**, que es la mejor de todas y **el modelo a copiar**: ya trae
un botón con la marca y una URL que llega por variable (`fichaUrl`).

**Cómo:** un helper `BOTON(url, texto)` en `templates.ts`, junto a `WRAP`,
extrayendo el botón que `pet_info_request` ya tiene escrito a mano.

> De paso: la variable se llama **`fichaUrl`** y debería llamarse `perfilUrl`.
> Es de antes del barrido «ficha»→«perfil» del 13-ago. Se renombra en la
> plantilla y en `admin/actions.ts:988`, que es quien la manda.

**Destinos — decididos por Pablo el 19-ago, ya sin dudas abiertas:**

| Plantilla | Liga | Texto del botón |
|---|---|---|
| `welcome` | `/app/perfil` *(ya la tiene)* | Completar mi perfil |
| `pet_approved` | `/app/peludos` | Ver a mi peludo |
| `pet_rejected` | `/app/peludos/<id>` | Ver qué falta |
| `pet_info_request` | `/app/peludos/<id>` *(ya la tiene)* | Enviar lo que piden |
| `reimbursement_approved` | `/app/reintegros/<id>` | Ver mi reintegro |
| `reimbursement_rejected` | `/app/reintegros/<id>` | **Ver el detalle** |
| `appeal_received` | `/app/apelaciones` | Ver mi apelación |
| `appeal_accepted` | `/app/apelaciones` | Ver la resolución |
| `appeal_rejected` | `/app/apelaciones` | Ver la resolución |
| `ambassador_received` | `/embajador` | Ver mi solicitud |
| `ambassador_approved` | `/embajador` | Ir a mi perfil de embajador |
| `ambassador_rejected` | **sin liga** | — |
| `ambassador_deactivated` | `/embajador/cuenta` | Ver mi cuenta |
| `center_received` | `/centro` | Ver mi solicitud |
| `center_approved` | `/centro` | Ir a mi panel |
| `center_rejected` | **sin liga** | — |
| `profile_incomplete_reminder` | `/app/perfil` | Completar mi perfil |
| `cancellation` | `/app/cuenta` | Reactivar mi membresía |
| `account_deactivated` | `/app/cuenta` | Ver mi cuenta |
| `plan_migrado` | `/app/cuenta` | Ver mis beneficios |
| `birthday_member` · `birthday_pet` | `/app` | Entrar a mi cuenta |
| `campaign_gift` | `/registro` *(ya la tiene)* | Obtener mi regalo |

**Las tres decisiones, para que no se re-pregunten:**

1. **`reimbursement_rejected` va al detalle, no directo a apelar.** Que la persona
   lea el motivo antes de decidir. Desde ahí ya puede apelar si quiere.
2. **`ambassador_rejected` y `center_rejected` van sin liga.** Invitar a volver a
   solicitar justo en el correo que comunica un «no» se lee como insistencia.
3. **Sí se pasa el identificador** a las plantillas que lo necesitan.

**Qué variable le falta a cada una** (verificado el 19-ago):

| Plantilla | Variables que recibe hoy | Qué agregar |
|---|---|---|
| `pet_rejected` | `petName`, `notes` | La URL del perfil del peludo |
| `reimbursement_approved` | `folio`, `amount`, `petName` | La URL del reintegro |
| `reimbursement_rejected` | `folio`, `petName`, `reason` | La URL del reintegro |
| `pet_info_request` | ya trae `fichaUrl` | Solo renombrarla a `perfilUrl` |
| Las de apelaciones | `firstName`, `folio`, … | Nada: van al listado, sin id |

La URL se arma en quien manda el correo, no en la plantilla — como ya lo hace
`admin/actions.ts` con `fichaUrl`. Eso mantiene a `templates.ts` sin lógica.

**Y lo que NO es esta fase:** los 3 correos de Supabase. Esos se pegan a mano en
el panel y ya están listos en `correos-plataforma/supabase-auth/`.

---

### Fase 5 · Persona física o moral — 4 a 5 jornadas · **la más grande**

Aplica a **los dos** formularios: embajador y centro (decisión 1.3).

**El flujo:**

1. Al inicio del formulario, un selector: **persona física** o **persona moral**.
2. **Persona física** → exactamente el flujo de hoy. No cambia nada.
3. **Persona moral** → se piden **razón social** y **RFC (constancia de situación
   fiscal)**. Al subir el RFC, **un popup avisa que un representante legal debe
   subir sus datos** (decisión 1.1b).
4. Los datos del representante son los que hoy se piden a la persona física:
   **CURP e INE por ambos lados**, y la **edad 18+ se valida contra la CURP del
   representante** (decisión 1.2), con la misma función del servidor que ya existe.

**Migración:**

- En `ambassadors` y en `wellness_centers`: `tipo_persona` (`fisica` | `moral`,
  por omisión `fisica` para no tocar a los que ya están), `razon_social`, `rfc`.
- En `documents`: columnas de revisión — `status` (`pendiente` | `aprobado` |
  `denegado`), `reviewed_by`, `reviewed_at`, `review_notes` — porque la revisión
  es **documento por documento** (decisión 1.5).
- Nuevos tipos en el enum `document_type`: `rfc_constancia`, y los del
  representante si se quieren separados de `ine_front`/`ine_back`.
- ⚠ Lleva `notify pgrst, 'reload schema'`.

**En el panel del comité:** cada documento con su propio estado y su nota. Hoy la
aprobación es una sola decisión sobre toda la solicitud; hay que poder aprobar el
RFC y dejar pendiente la INE del representante.

**Los centros hoy no piden ningún documento**, así que para ellos esto no es
«agregar una rama»: es **estrenar la captura de documentos completa**, incluida la
persona física. Es la parte que más se subestima de esta fase.

**Y hay que revisar los legales.** El convenio y los términos están escritos
pensando en una persona física que contrata. Que una persona moral se dé de alta
como embajador o centro es un supuesto que el despacho debería contemplar.

---

## Cómo retomar en otra sesión

1. Leer este documento y `CLAUDE.md`. Trabajar en
   `C:\Users\USER\dev\pata-amiga-live`, rama `staging`.
2. **No hay nada pendiente de confirmar.** Las tres dudas de la fase 4 las
   cerró Pablo el 19-ago y están resueltas en la tabla de esa fase.
3. Empezar por la **fase 1**, que es media jornada y da una victoria visible.
4. Verificar cada fase en el navegador con las cuentas de prueba de `CLAUDE.md`,
   en escritorio y en 375px, antes de commitear.
5. `npm run lint` y `npm run build` antes de empujar. Un `export const` en un
   archivo `"use server"` pasa el typecheck y tumba el build.

## Lo que queda abierto

- **Las 3 plantillas de Supabase** — alguien las pega en el panel, en pruebas y
  en producción. Ya están listas en `correos-plataforma/supabase-auth/`.
- **Para el despacho:** que los legales contemplen a la persona moral, y la
  pregunta que ya venía pendiente sobre el plazo de conservación de la INE.
- **El «rechazado» de los textos legales** (5 apariciones) — se les anota, no lo
  tocamos nosotros.
