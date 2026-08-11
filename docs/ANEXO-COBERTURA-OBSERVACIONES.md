# Anexo de cobertura — lo que faltaba en el plan

Auditoría hecha el 11-ago-2026 releyendo **las cuatro fuentes** contra
`PLAN-OBSERVACIONES-11-AGO.md`.

**Resultado:** el plan cubre bien las notas de Pablo, la junta y las notas de la PM.
El **documento acumulado del equipo** (`Observaciones landing page Pata Amiga_V1`) tenía
observaciones que NO habían quedado registradas. Están todas abajo. Ninguna cambia las
reglas de negocio ya cerradas.

---

## A. Miembro — cosas que faltaban

| # | Observación | Fuente | Dónde entra |
|---|---|---|---|
| A1 | ~~El certificado senior no se puede subir durante el alta~~ → ✅ **YA EXISTE** (verificado 11-ago: el aviso senior del alta dice "Puedes subirlo aquí mismo o después" y trae la subida). Se arregló el 5-ago; **reprobar**, no reconstruir. | Doc equipo | — |
| A2 | **Falta poder subir foto de perfil** del usuario (el círculo marcado en rojo en edición de información personal). | Doc equipo | Fase 3 |
| A3 | **Falta la opción "cambiar contraseña"** en el perfil del usuario. | Doc equipo | Fase 2 · va junto con el trabajo de cuentas (2.1) |
| A4 | **Revisar qué documentos de perfil se exigen realmente** — el sistema dice "faltan" sin que quede claro cuáles. | Doc equipo | Fase 2 · junto con "completar documentos" → "en revisión" |
| A5 | **Ajustar la presentación de los campos** en el apartado de facturación. | Doc equipo | Fase 3 |
| A6 | **Vista de centro de bienestar para el miembro:** hoy solo deja llamar al teléfono. Falta ver servicios, sucursales y detalle. | Doc equipo | Fase 2 · superficie de miembro |
| A7 | **El % de avance de perfil miente** — marca 85% aunque todos los datos estén guardados. | Doc equipo (registro embajadores) | Fase 2 · aplica a embajador y probablemente a miembro |

## B. Centros de bienestar — cosas que faltaban

| # | Observación | Fuente | Dónde entra |
|---|---|---|---|
| B1 | **La foto del negocio no se refleja** tras subirla. | Doc equipo | Fase 2 (2.3) |
| B2 | **No se pueden modificar los servicios ni agregar nuevas sucursales** desde el perfil. | Doc equipo | Fase 2 (2.3) |
| B3 | **Falta procedimiento de baja voluntaria** del centro. | Doc equipo | Fase 6 |
| B4 | **Falta dar de baja a un centro desde el administrador.** | Doc equipo | Fase 4 |

## C. Embajadores — cosas que faltaban

| # | Observación | Fuente | Dónde entra |
|---|---|---|---|
| C1 | ~~No hay forma de solicitar la baja voluntaria desde el perfil del embajador~~ → ✅ **SÍ EXISTE**: `BajaEmbajadorCard` en `/embajador/cuenta`. Quien probó **no la vio porque estaba pendiente** y el layout le tapaba todo el portal. Resuelto con el arreglo del 11-ago. **Reprobar.** | Doc equipo | — |
| C2 | **No hay forma de dar de baja a un embajador** desde el admin. | Doc equipo | Fase 4 |
| C3 | **Campos de RRSS editables** en la edición de información del embajador. | Doc equipo | Fase 2 (2.1) |
| C4 | Aclarar **qué información se muestra** en la edición del embajador (¿nombre del referido?). | Doc equipo | pregunta abierta (§E) |

## D. Admin — cosas que faltaban

| # | Observación | Fuente | Dónde entra |
|---|---|---|---|
| D1 | **Mover "Banco" al apartado de reintegros** (hoy está en miembros). | Doc equipo | Fase 4 |
| D2 | **Botón de "Bajas"** en mascotas, junto al de apelaciones (solo super admin). | Doc equipo | Fase 4 |
| D3 | **Agregar barra de desplazamiento** donde falta. | Doc equipo | Fase 3 |
| D4 | **Notificaciones en LOS DOS lugares** — campanita arriba a la derecha **y** entrada en la barra lateral, en la posición que marca el orden del menú (segunda, después de Resumen). Ambas con contador. ✅ **DECIDIDO por Pablo el 11-ago.** | Doc equipo + Pablo | Fase 4 |

## E. Pruebas que el equipo aún no ha podido hacer
No son bugs; son flujos sin verificar. Se registran para que no se den por buenos.

- Proceso de **reintegro** completo (no se ha cumplido el período de espera de ninguna mascota).
- **Baja voluntaria** del miembro · **baja desde el administrador**.
- **Pago de comisiones a embajadores** por suscripciones.
- Registro de **nuevo miembro con código de embajador** → verificar que se refleje en el
  tablero del embajador.
- Correos de miembro **sin certificado médico / sin foto** (Cipatli no pudo confirmar si se probaron).

## F. Decisiones abiertas del documento del equipo
Ninguna bloquea la Fase 1, pero hay que resolverlas antes de construir lo suyo.

1. **¿Los miembros califican a los centros de bienestar?** → ⏸ **TBD.** Se retoma al llegar
   a esa fase (Pablo, 11-ago). No se diseña nada de rating por ahora.
2. ~~Fecha de liberación pública del registro de embajadores~~ → ✅ **YA ESTÁ LANZADO**
   (Pablo, 11-ago). **Ver la consecuencia en §G.**
3. **¿Qué apelaciones se están considerando** — de reintegros, o de bienvenida a la manada
   por mascota? Si son ambas, ¿cómo se clasifican? → *lo leo del código y lo reporto; el
   equipo solo confirma la clasificación.*
4. **¿Qué significa el contador de notificaciones en mascotas** — aprobadas, pendientes,
   ambas? → *lo leo del código y lo reporto.*
5. ~~Plantilla genérica de correo con destinatario manual~~ → ✅ **NO se hace por ahora**
   (Pablo, 11-ago).
6. ~~Sugerir dominios de correo mientras escriben~~ → ✅ **SÍ se agrega** (Pablo, 11-ago).
   Sugerencias `@gmail.com`, `@hotmail.com`, `@outlook.com`, `@yahoo.com` en los campos de
   correo de los registros (miembro, embajador y centro), no solo en el de centros.
7. ~~Campanita vs. barra lateral para notificaciones~~ → ✅ **RESUELTO: van las dos** (ver D4).

---

---

## G. 🔴 Consecuencia de que el registro de embajadores YA esté lanzado

Al planear la Etapa 2.1 se dio por hecho que las solicitudes sin cuenta amarrada eran solo
de prueba. **Eso vale para staging, pero el registro de embajadores ya está público en
producción** (confirmado por Pablo el 11-ago).

Entonces es muy probable que en producción haya **solicitudes reales de embajador cuyo
`user_id` es `null`** — personas que aplicaron, nunca recibieron cuenta, y hoy **no pueden
entrar de ninguna forma**: su recuperación de contraseña no manda nada porque no existe
usuario que recuperar.

**Antes de desplegar la 2.1 hay que:**
1. Contar en producción: `select count(*) from ambassadors where user_id is null;` y lo
   mismo para `wellness_centers`.
2. Decidir qué se hace con esas personas: invitación de una sola vez para que pongan
   contraseña, o pedirles que se registren de nuevo con el mismo correo y ligar por correo.
3. **Preguntar antes de tocar esos datos.** Son personas reales esperando respuesta.

No bloquea construir la 2.1 — pero sí bloquea darla por terminada en producción.

## Nota de método
Este anexo existe porque el plan se armó priorizando las notas de Pablo y la junta, que es
lo que se pidió — pero el documento acumulado del equipo traía observaciones viejas que no
se repitieron en los nuevos y se habrían perdido. **Antes de cerrar cada fase, recontar
contra este anexo.**
