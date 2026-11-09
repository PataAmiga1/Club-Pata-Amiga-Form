# El Buen Fin 2026 — guía del equipo

Campaña «El Buen Fin 2026: La cuenta de Pata Amiga». Vigencia: **13 al 17 de
noviembre de 2026**, hora del centro de México. Código único: **BUENFIN**.

- Página de la campaña: **`https://www.pataamiga.mx/buenfin`** (también abre
  con `/buen-fin`).
- Configuración (fechas, código, cifras de la pauta): `src/lib/campanas/buen-fin.ts`.
  Es el único lugar donde viven; no se escriben en ningún otro archivo.

---

## ⚠ Antes de publicar: el precio anual no cuadra con la pauta

La pauta dice **anual regular $7,188 → $6,589 en Buen Fin (ahorras $599)**.
La plataforma vende el anual a **$6,612** (versión publicada del plan $599;
es también lo que cobra Stripe). Con el cupón de $599:

| | Pauta | Lo que cobraría el checkout |
|---|---|---|
| Mes a mes, primer mes | $0 | $0 ✓ |
| Mes a mes, desde el 2.º mes | $599 | $599 ✓ |
| Anual, precio regular | $7,188 | **$6,612** |
| Anual con BUENFIN | $6,589 | **$6,013** |

Consecuencias: el «precio regular $7,188» no existe (en El Buen Fin un precio
de referencia que no es el real es un riesgo con PROFECO), y el anual quedaría
**más barato** que el primer año mes a mes ($6,013 contra $6,589), lo
contrario de lo que dice la «comparación honesta».

La página **no inventa cifras**: enseña lo que de verdad se cobra. Mientras no
cuadre, fuera de producción aparece una franja negra que lo avisa, y la
comparación deja de decir «cuestan lo mismo». Hay que decidir una de dos:

1. **Corregir la pauta del anual** a $6,612 → $6,013 (ahorras $599). No toca
   la plataforma.
2. **Cambiar el precio anual** a $7,188 publicando una versión nueva del plan.
   Sube el anual para todos los que contraten desde ese día; es una decisión
   de negocio, no de la campaña.

---

## 1. Crear el código BUENFIN (la PM, en el panel)

**Ventas → Membresías → Cupones → «+ Nuevo cupón»**:

| Campo | Valor |
|---|---|
| PALABRA | `BUENFIN` |
| NOMBRE (interno) | `El Buen Fin 2026` |
| DESCUENTO | **Monto fijo (MXN)** |
| PESOS DE DESCUENTO | **599** |
| APLICA A | **Solo el primer cobro** |
| VIGENTE HASTA | **17/11/2026** (vale hasta las 23:59 h de México de ese día) |
| TOPE DE USOS | vacío (sin tope) |
| SOLO PARA EL PLAN | **Cualquier plan** ← importante |
| DEJARLO COMO LA PALABRA DE UNA LANDING | No cambiar ninguna landing |
| NOTA | `Buen Fin 13–17 nov 2026: $0 primer mes / $599 menos en el anual` |

Por qué así:

- **Un solo cupón da las dos promociones.** $599 de descuento una vez: en el
  mensual de $599 el primer cobro queda en $0 y los siguientes son de $599;
  en el anual se descuentan $599 del pago del año (también si se paga a 3 o 6
  meses sin intereses).
- **«Cualquier plan», no «solo $599».** El anual a meses sin intereses se
  cobra sobre otro producto de Stripe; un cupón restringido al plan no le
  aplicaría.
- **La vigencia ya se guarda en hora de México.** Antes de este cambio un
  cupón «hasta el 17» vencía el 17 a las 17:59 (el servidor corre en UTC).
  Por eso el cupón se crea **después** de que este cambio esté en producción.

Lo crea el panel en Stripe; no hay que entrar a Stripe.

## 2. ¿Cuándo crearlo? (un código de promoción no tiene fecha de inicio)

Stripe deja poner vencimiento, pero **no fecha de inicio**: desde que se crea,
el código ya descuenta. Hay dos opciones y recomendamos la segunda:

- **Crearlo el viernes 13 a primera hora.** Nadie lo usa antes, pero si se
  crea tarde, quien entre desde la página a las 00:30 paga precio completo:
  la página abre la promoción a las 00:00 por su cuenta.
- **Recomendado: crearlo el jueves 12 entre las 22:00 y las 23:59.** Queda
  activo una o dos horas antes, que en la práctica nadie aprovecha (la página
  todavía dice «Muy pronto» y la pauta aún no publica el código), y a las
  00:00 del 13 ya funciona cuando la página abre los botones.

No hace falta apagarlo el 18: vence solo a las 23:59 del 17 y la página pasa a
«La promoción terminó». Si se quiere cortar antes, **Desactivar** en la misma
lista.

## 3. Cómo funciona el enlace

1. La persona abre `/buenfin` y elige **Mes a mes** o **Anual**.
2. El botón la lleva a `/registro?modalidad=mensual|anual&promo=BUENFIN`,
   con los `utm_*` y `fbclid` del anuncio.
3. El registro guarda la modalidad y el código. El parámetro **no** es
   `codigo` (ese es el del embajador, que cambia el tiempo de espera); un
   código de embajador y BUENFIN se pueden usar juntos.
4. En el paso del plan la modalidad ya viene elegida y el código ya viene
   aplicado: cada tarjeta dice **cuánto paga hoy y cuánto después**.
5. Stripe abre el pago con el descuento puesto.

Si BUENFIN no existe en Stripe (antes de crearlo, o en pruebas), la página
del plan avisa «El código BUENFIN no está activo en este momento» y el pago
sigue a precio regular, con la casilla de código de Stripe disponible. Nunca
se bloquea el pago.

**Segundo peludo:** BUENFIN es solo para el primer peludo. A quien ya es
miembro y paga otro peludo no se le aplica solo, y si lo escribe en nuestra
casilla se le explica que su peludo adicional ya tiene 15%. *Hueco conocido:*
la casilla de código de la página de Stripe sí lo aceptaría si lo escribe ahí.

**Fechas de la página** (hora de México): antes del 13, «Del 13 al 17 de
noviembre» sin botones de pago; del 13 al 17, activa; desde el 18, «La
promoción terminó» con liga al registro normal.

**Requisito:** el registro tiene que estar **abierto** (Admin → Sitio). Con el
registro cerrado la página dice «La contratación no está disponible» y no
enseña botones.

## 4. Probar en pruebas (staging)

Staging usa Stripe en **modo de prueba**: nada de lo que se haga ahí cobra.

1. En `https://pata-amiga-pruebas.vercel.app/ventas/membresias` crea BUENFIN
   con los mismos datos del punto 1 (se crea en el Stripe de prueba).
2. Ve los tres estados de la página antes de tiempo:
   - `…/buenfin?vista=antes`
   - `…/buenfin?vista=activa`
   - `…/buenfin?vista=terminada`

   (`?vista=` solo funciona fuera de pataamiga.mx o con sesión del equipo.)
3. Con `?vista=activa`, toca **Elegir mes a mes**, crea una cuenta con un
   correo de prueba, registra un peludo y en el plan confirma: modalidad
   «Mensual» elegida, aviso «Con BUENFIN: hoy pagas $0 · después $599 al mes».
4. Paga con la tarjeta de prueba **4242 4242 4242 4242**, cualquier fecha
   futura y cualquier CVC. En Stripe (modo prueba) la factura debe salir en $0.
5. Repite con **Elegir anual**: botón «Elegir anual» (una exhibición) y
   «Pagarlo a 3 o 6 meses sin intereses». Las tarjetas de prueba de MSI de
   Stripe México están en su documentación de *installments*.
6. Borra el cupón de prueba al terminar (Desactivar).

## 5. Enlaces para la pauta

Base: `https://www.pataamiga.mx/buenfin`

| Pieza | Enlace |
|---|---|
| Stories S3/S4 | `https://www.pataamiga.mx/buenfin?utm_source=instagram&utm_medium=story&utm_campaign=buenfin2026&utm_content=s3-s4` |
| Reel R2 (mensual) | `https://www.pataamiga.mx/buenfin?utm_source=instagram&utm_medium=reel&utm_campaign=buenfin2026&utm_content=r2-mensual` |
| Reel R3 (anual) | `https://www.pataamiga.mx/buenfin?utm_source=instagram&utm_medium=reel&utm_campaign=buenfin2026&utm_content=r3-anual` |
| Facebook | `https://www.pataamiga.mx/buenfin?utm_source=facebook&utm_medium=paid_social&utm_campaign=buenfin2026&utm_content=r4-comparacion` |
| WhatsApp | `https://www.pataamiga.mx/buenfin?utm_source=whatsapp&utm_medium=mensaje&utm_campaign=buenfin2026&utm_content=w1` |

Los anuncios de Meta agregan `fbclid` solos; la página lo pasa al registro.

## 6. Medición

La página manda **ViewContent** al píxel de Meta (y `view_promotion` a GA4),
solo si la persona aceptó cookies. Lo demás sale como siempre: Lead al crear
la cuenta, CompleteRegistration al registrar al peludo, InitiateCheckout al
abrir el pago y Purchase al pagar.

## 7. Textos que cambiamos respecto al documento maestro

- «Sin deducible ni copago» → **«Sin copago»**. *Deducible* está prohibida aun
  en negativo.
- «Emergencias graves: hasta $30,000 por evento» → **«Desde $30,000 al año a
  partir del mes 7; crece cada mes pagado hasta $60,000 al año»**. El monto
  es anual por peludo y crece; no es por evento.
- Los tiempos de espera de la membresía de $599 son las aperturas de cada
  rubro (cuidados día 31, despedida, emergencias mes 7), contadas desde que el
  comité aprueba al peludo. La página los lee de la versión publicada.
