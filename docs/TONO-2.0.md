# Tono 2.0 — plan de aplicación

Documento del equipo: **«Tono 2.0 Pág Web.docx»** (16-ago-2026), 31 pantallas con
recuadros de color señalando qué cambiar y una línea por color con el texto nuevo.

- **Visor instrucción ↔ captura:** `tono-2.0/revision-tono-2.0.html` en la carpeta de
  consultoría (se abre con doble clic, o `preview_start` con el nombre `tono-2.0`).
- **Ojo con el orden:** en el documento original la instrucción va antes de la foto
  *casi* siempre. En las pantallas **11, 15, 28 y 29 va después**. El mapeo del visor
  está verificado captura por captura; seguir el orden a ciegas pega tres bloques a la
  pantalla equivocada.
- **Las capturas son de antes del 13-ago.** Muestran «ficha», «período de espera» y las
  categorías viejas de centros. Varias instrucciones piden cosas que ya están hechas.

## Lo que el documento realmente trae

No son 31 cambios de texto. Son tres cosas mezcladas:

1. **Un cambio de vocabulario global** disfrazado de retoque de tono (peludo/lomito/michi).
2. **La corrección de un error de la página** que nadie había reportado como error: hoy el
   sitio afirma que el código de embajador «NO reduce períodos de espera», y es falso —
   baja la espera de 180 a 90 días desde el 11-jul (`src/lib/waiting-period.ts`).
3. **Retrocesos** contra decisiones del 13-ago (reintroduce «período de espera» y «los 10
   dígitos» del teléfono), por trabajar sobre capturas viejas.

## Decisiones (Pablo, 16-ago)

| # | Decisión |
|---|---|
| 1 | Barrido **global**. `peludo` = perro o gato · `lomito` = perro · `michi` = gato. Las etiquetas cambian según la especie ya elegida |
| 2 | Se queda **«Centros Aliados»**. Los «Centros de Bienestar» del documento se normalizan a ese nombre |
| 3 | Pago al embajador **el día 5** (queda como está). Se rechaza «en los primeros 10 días» |
| 4 | Solo **tarjeta de crédito y débito**. Fuera OXXO y SPEI |
| 5 | Tarjeta de centros aliados (pantalla 02): «Clínicas, pet shops, hospedajes y más con beneficios para la manada en todo México.» Título: «Centros aliados (Próximamente)» |
| 6 | El recuadro morado de la portada era una pregunta del equipo, no un texto. Sin cambio |
| 7 | Firma de TODOS los correos: **«Pata Amiga · El mejor cuidado para tu manada»** |
| 8 | `miembros@pataamiga.mx` **solo** en las pantallas 22 y 29. El resto sigue con `soporte@` |
| 9 | Donde el documento diga «período de espera» → **«tiempo de espera»**. Donde pida «los 10 dígitos» → se conserva la **lada internacional** |

## Glosario y reglas del barrido

| Antes | Después | Cuándo |
|---|---|---|
| mascota / mascotas | peludo / peludos | Siempre que sea texto visible |
| perro | lomito | Etiqueta visible. La llave sigue siendo `dog` |
| gato | michi | Etiqueta visible. La llave sigue siendo `cat` |

**Qué NO se toca:**

- **Los textos legales** (`src/data/legal-texts.ts`). Son del despacho y ya están pendientes
  de reemisión al tono 2026. Tocarlos aquí crearía una tercera versión.
- **Las llaves internas.** `pets.species` guarda `dog`/`cat` (192 y 106 filas en pruebas);
  las categorías de centro guardan `clinic`, `store`, `hotel`… Solo cambia la etiqueta, así
  que **el barrido no lleva migración**.
- **Los nombres de variables, funciones y archivos.** Solo cambian cadenas visibles. Un
  `petId` sigue siendo `petId`.

**Dónde vive el vocabulario:** en `src/lib/vocabulario.ts`, no repartido. Cualquier etiqueta
que dependa de la especie sale de ahí, para que la próxima vez que el equipo cambie una
palabra sea un archivo y no una cacería.

## Fases

> **Estado al 16-ago: las fases A, B y D están aplicadas y verificadas en
> pruebas.** Lo único abierto es lo de la sección «Fuera de nuestras manos» y las
> dos preguntas del final.

### Fase A — Vocabulario (global)

Reparto medido de «mascota» (72) y «perro/gato» (78) en texto visible:

| Zona | Aprox. | Nota |
|---|---|---|
| `src/app/admin` | 63 | Panel del comité. Sí entra (decisión 1) |
| `src/lib/llm` | 48 | Prompts de los agentes. **Al final**, verificando que el bot no hable raro |
| `src/lib/plans` | 24 | Beneficios y etiquetas de plan |
| `src/lib/email` | 23 | Las 31 plantillas transaccionales |
| `src/app/app` | 17 | Portal del miembro |
| `src/components/landing` | 12 | Portada |
| resto | ~40 | Ventas, registro, componentes |

Etiquetas dinámicas: solo 5 lugares pintan el literal «Perro»/«Gato» y 26 ramifican por
especie. Todos pasan por `vocabulario.ts`.

**Lo que quedó sin tocar y por qué**, para que nadie lo «arregle» después:

- La ruta `/admin/mascotas` y sus `revalidatePath`. Renombrarla rompe enlaces guardados
  y no es lo que pide el documento; solo cambió la etiqueta del menú.
- La herramienta `mis_mascotas` del asistente: es un identificador que comparten la
  definición, el despacho y el mock. Cambió su descripción, no su nombre.
- Las llaves de eventos CRM (`mascota_aprobada`), los beneficios (`espera_mascota_*`,
  `mascotas_activas_max`) y `pets.species` (`dog`/`cat`).
- Cinco filas de `pets` cuyo NOMBRE real es «Mascota» (vienen de la migración). Son datos
  del miembro, no copy: si se ven feas en el panel, se corrigen en la base, no en el código.

### Fase B — Las 31 pantallas

Con el vocabulario ya aplicado. Se revisa una por una contra el visor y se reporta cuáles
no necesitaban nada. Ya verificadas como **hechas** antes de empezar:

- **09** (colonia sugerida por CP) — el texto ya dice exactamente eso.
- **12 y 14** (parcial) — «tiempo de espera» y «perfil» se barrieron el 13-ago.
- **23 y 27** (categorías) — ya dicen «Petshop», «Hospedaje» y «Despedida y memorial».

### Fase C — Correos

- Los 31 transaccionales salen de `src/lib/email/templates.ts`. La tabla `email_templates`
  (sobreescrituras de `/admin/comunicados`) **está vacía en pruebas**, así que cambiar el
  código sí cambia lo que se manda.
- La firma es una sola constante (`FOOTER`).
- **Las pantallas 28 y 29 no son nuestras:** son plantillas de **Supabase Auth**, se editan
  en el panel de Supabase y son las mismas en pruebas y producción.

### Fase D — Lo que no es tono

- Pantalla 17: corregir el texto del programa de embajadores (6 → 3 meses).
- Pantalla 06: quitar «OXXO y SPEI» del texto de métodos de pago.
- Pantalla 10: el aviso de «CURP no coincide con la fecha de nacimiento» probablemente
  desaparece — desde el 16-ago la fecha SALE de la CURP, así que ya no puede haber
  discrepancia entre las dos. El cruce que queda es contra nombre y apellidos.

## Fuera de nuestras manos

1. **Apagar OXXO y SPEI en Stripe.** No están fijados en el código (`payment_method_types`
   no se declara): el checkout ofrece lo que esté prendido en el panel. Si solo cambia el
   texto, la pantalla dirá «solo tarjeta» mientras Stripe los sigue aceptando.
2. **Plantillas de Supabase Auth** (correos 28 y 29).
3. **Verificar sobreescrituras de correo en PRODUCCIÓN** antes del merge. En pruebas no hay
   ninguna, pero esa base es una copia que puede ser vieja; si producción tiene una plantilla
   editada a mano desde `/admin/comunicados`, el cambio de código no le llega.
4. **La imagen de la pantalla 03** («agregar imagen alusiva y que tenga la identidad»). El
   slot ya es editable desde Admin → Sitio web, así que entra sin desplegar.
5. **Los materiales del embajador** (pantalla 20) siguen en «MUY PRONTO» porque los archivos
   no han llegado.

## Datos que se dejaron de pedir (Pablo, 19-ago)

En el **alta de embajador**:

- **La fecha de nacimiento ya no se teclea**: sale de la CURP, que aquí es
  obligatoria y con formato validado. La regla de 18+ no cambia; lo que cambia es
  que se calcula en el SERVIDOR desde la CURP, no desde lo que mande el navegador.
- **Del domicilio solo queda el código postal.** Colonia, ciudad y estado se
  pedían y solo se mostraban: no los usa el archivo del banco (CLABE,
  beneficiario, banco, monto, concepto, correo) ni lo fiscal, que opera con RFC y
  CFDI. Ciudad y estado se siguen guardando pero **derivados del CP**, así que el
  panel conserva la ubicación y el equipo la estadística.

Sin migración: no se borró ninguna columna, solo se dejó de pedir el dato.

**El marco legal empuja en esa dirección, no en contra.** La LFPDPPP nueva
(vigente 21-mar-2025) enumera la *proporcionalidad* entre sus principios: solo se
justifica recabar lo necesario para la finalidad declarada. Antilavado tampoco lo
exige — la lista de actividades vulnerables del art. 17 LFPIORPI es cerrada y
pagar comisiones por referidos no encaja en ninguna fracción.

## Preguntas abiertas para el equipo

- **Pantalla 02, recuadro verde:** el texto que le asignaron a la tarjeta de centros aliados
  era una copia del de reintegros. Se resolvió con la decisión 5, pero conviene que lo
  confirmen.
- **Pantalla 21:** cambia «el comité» por «el equipo de Pata Amiga». ¿Aplica en todas las
  pantallas donde hoy decimos «el comité»? Son bastantes. Por ahora se cambia solo ahí.
- **Del alta de embajador, para el despacho:** ¿el aviso de privacidad vigente
  declara el domicilio del embajador como finalidad? ¿Y qué justifica conservar su
  **INE por ambos lados**, y por cuánto tiempo? Es el dato más pesado que se
  recaba de un embajador — más que la fecha o el CP — y hoy no hay política de
  retención escrita.
- **El título de la pestaña** (`layout.tsx` y `page.tsx`) sigue diciendo «Protección para
  tu manada». Con el encabezado nuevo («Salud y tranquilidad para tu manada») y la firma
  nueva de los correos («El mejor cuidado para tu manada») ya son tres frases para lo
  mismo. Es un título de SEO y merece decisión propia, así que no se tocó.

## Lo que se corrigió y no era tono

- **El código de embajador SÍ reduce la espera.** La página decía lo contrario. Corregido
  a «de 6 a 3 meses», que es lo que hace `petWaitingPeriodDays` (180 → 90) desde el 11-jul.
- **«En cuanto su perfil sea aprobada»** en la pantalla de bienvenida: concordancia rota
  que dejó el barrido «ficha»→«perfil» del 13-ago. Se barrió `src/` buscando más y no
  quedan. Es el mismo riesgo del cambio actual, con los géneros al revés.
- **La fecha de nacimiento del perfil ya no se sincroniza con un `useEffect`**: se deriva
  de la CURP en el mismo render. El efecto pintaba un render intermedio con la fecha
  anterior, y el lint lo marcaba.
