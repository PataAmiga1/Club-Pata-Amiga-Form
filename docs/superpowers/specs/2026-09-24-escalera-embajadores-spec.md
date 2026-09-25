# Escalera de niveles del programa de embajadores — especificación

**Fecha:** 2026-09-24
**Estado:** borrador para revisión. **Nada de esto se construye ni se publica** hasta que cierren
las decisiones abiertas (§8) y Pablo autorice.
**Origen:** documento de producto v9.1 (escalera Aliado/Embajador/Oro/Círculo Fundador),
preguntas de juntas/78, respuestas de la gerencia de ventas del 24-sep, encuesta de embajadores
(juntas/63).

---

## 1. Qué es

Hoy un embajador gana **3% mensual** sobre todo lo que paga cada socio que trajo. La escalera
agrega un segundo premio: **beneficios sobre su propia membresía** según cuántos socios activos
sostenga. Los embajadores lo pidieron así: 12 de 20 dijeron que les mueve más un beneficio para
sus mascotas que más comisión.

El 3% **no se toca**: sigue como está, en paralelo (respuesta de la gerencia, pregunta 3).

## 2. La escala (propuesta a confirmar)

Une las dos versiones que la gerencia pidió probar juntas, y respeta el tope de tres membresías.

| Nivel | Meta (socios activos) | Beneficio |
|---|---|---|
| Aliado | 1 | Su membresía a mitad de precio |
| Embajador | 2 | Su membresía gratis |
| Embajador Plata | 5 | Gratis + su nombre y su historia en redes |
| Embajador Oro | 12 | Dos membresías gratis |
| Círculo Fundador | 25 | Tres membresías gratis + voz en el catálogo cada trimestre |

**Por qué el salto a «gratis» está en 2 y no en 1:** cada peludo cuesta ~$378 al mes entre su
aportación al fondo y la operación, y cada socio referido deja ~$174. Con un solo referido el
beneficio sale de la bolsa de Pata Amiga; con dos se paga solo. Si el equipo prefiere regalarla
desde el primero, se puede — pero como decisión consciente de inversión, no por descuido.

**Nada de esto va escrito en el código.** Metas, beneficios y nombres viven en una tabla
(`ambassador_tiers`) que se edita desde el panel: el día que quieran mover la meta de 5 a 4, se
cambia ahí, sin despliegue. Es la misma lección de los recordatorios y de los tiempos de espera.

## 3. Qué cuenta como «socio activo»

Definido por la gerencia (respuesta 2):

- Cuenta **desde el primer cobro exitoso** con su código (no desde el registro).
- **Deja de contar si cancela** — y en ese momento también deja de generar el 3%.
- **Una persona, no un peludo:** un socio con dos peludos cuenta como uno. *(A confirmar: la
  respuesta 2.2 puede leerse al revés.)*
- El **pago anual cuenta como un socio**, no como doce.

En la base ya existe todo lo necesario: `referrals` liga embajador → socio, y `subscriptions`
dice si sigue viva. El conteo es una consulta, no una tabla nueva.

## 4. Cómo se entrega el beneficio

**Regla técnica (decidida por nosotros, a confirmar):** el beneficio se aplica como **descuento
de Stripe sobre su suscripción**, nunca cancelando la suscripción.

Por qué importa: los montos del $599 crecen con los **meses pagados**, y un mes en $0 solo cuenta
como mes pagado si viene de un descuento (así quedó el 19-sep con el cupón EXPOCAN). Si en vez de
descontar canceláramos su membresía, el embajador perdería su antigüedad y sus montos — el
beneficio se volvería un castigo.

- **Aliado:** cupón de 50% recurrente mientras conserve el nivel.
- **Gratis:** cupón de 100% recurrente mientras conserve el nivel.
- **Dos o tres membresías gratis:** el 100% se aplica a sus peludos por orden de antigüedad.
- **Si paga anual:** no se puede «dejar de cobrar» a media anualidad. Se le **recorre la fecha de
  renovación** los meses que le tocaban gratis. *(Decisión abierta, §8.)*

## 5. El embajador que todavía no es miembro

**Hoy los 7 embajadores aprobados están en `pending_payment`: ninguno paga.** «Tu membresía
gratis» no premia a nadie tal como está. Tres caminos, para que el equipo elija (§8):

1. **El beneficio solo aplica si ya es miembro.** El más barato y el más justo con quien sí paga.
   Obliga al embajador a entrar como miembro primero.
2. **Se le regala la membresía al alcanzar la meta**, aunque nunca haya pagado. Cuesta desde el
   día uno y le da beneficios completos a un peludo que jamás aportó.
3. **Mixto:** entra pagando, y al primer socio referido se le devuelve lo pagado como descuento.

## 6. La máquina de estados

Una tarea diaria (el mismo cron de recordatorios) revisa a cada embajador aprobado:

1. Cuenta sus socios activos.
2. Calcula el nivel que le toca por la tabla de niveles.
3. **Si sube:** aplica el cupón que corresponde, guarda el cambio en `ambassador_tier_history` y
   le manda su correo de felicitación.
4. **Si baja:** no se le quita nada de inmediato. Entra en **un mes de gracia** (aviso por correo);
   si al mes siguiente sigue debajo, se retira el cupón y baja de nivel.
5. Todo cambio queda asentado con su fecha y su motivo, para que nadie discuta un corte.

*(La gerencia pidió «evaluarlo mes a mes»; el mes de gracia es nuestra propuesta para que nadie
pierda su beneficio por una cancelación ajena.)*

## 7. Lo que se construye

**Base de datos**
- `ambassador_tiers` — niveles editables: nombre, meta, tipo de beneficio, valor, extras.
- `ambassador_tier_history` — un renglón por cambio de nivel (quién, cuándo, de qué a qué, por qué).
- `ambassadors` gana `tier_id`, `tier_since`, `grace_until`.

**Servidor**
- `nivelDeEmbajador(admin, ambassadorId)` — cuenta socios activos y devuelve el nivel que le toca.
- `aplicarBeneficioDeNivel(...)` — crea o retira el cupón en Stripe sobre su suscripción.
- `revisarNivelesDeEmbajadores(admin)` — la pasada diaria, con su mes de gracia.
- Se engancha al cron existente `/api/cron/documentos`, que ya corre a diario.

**Panel del embajador**
- Su nivel actual, qué gana hoy y **cuánto le falta para el siguiente** (barra de avance).
- Sus socios activos, con la fecha en que cada uno empezó a contar.
- Aviso visible cuando está en mes de gracia.

**Panel del comité**
- Lista de embajadores con su nivel, sus socios activos y el costo mensual de su beneficio.
- **Costo total del programa al mes** — cuántas membresías se están regalando y cuánto suman.
- Botón para forzar un nivel a mano, con nota obligatoria (casos especiales).

**Correos** (plantillas editables, como todo lo demás)
- Subiste de nivel · Beneficio aplicado · Estás en mes de gracia · Beneficio retirado.

## 8. Decisiones abiertas — sin esto no se construye

1. **La escala** de §2: ¿se aprueba, o «gratis» desde el primer socio?
2. **El embajador que no es miembro** (§5): ¿cuál de los tres caminos?
3. **Un socio con dos peludos:** ¿uno o dos para la meta?
4. **Comisión del anual:** hoy el 3% se reparte en los 12 meses que cubre. ¿Se deja así o se paga
   completa en el corte del mes del cobro? (Recomendamos dejarla repartida: si ese socio cancela
   a mitad del año, no quedamos pagando de más.)
5. **Premio del nivel Oro:** «código sin espera» ya no existe — todas las esperas son de 30 días.
   ¿Se sustituye por la segunda membresía gratis?
6. **Anual del embajador:** ¿se le recorre la renovación o se le acredita?
7. **Mes de gracia:** ¿se aprueba?
8. **«El extra por vestir y promocionar la marca»** (respuesta 3 de la gerencia): ¿qué es, cuánto,
   cada cuándo y quién lo autoriza? Hoy no existe en ningún lado.
9. **CFDI** de un cobro en $0, si lo piden.
10. **Limpieza de solicitudes** (juntas/79): a quién se admite de las 22 reales, si se borran las
    9 de prueba, y qué pasa con la cuenta aprobada de febrero que sostiene el único referido.

## 9. Cómo se prueba antes de tocar producción

En el ambiente de pruebas, con Stripe de prueba:

1. Embajador con 0 socios: no recibe nada.
2. Llega a la meta: se aplica el descuento, su siguiente factura sale en $0 y **ese mes sí cuenta**
   como mes pagado (los montos siguen creciendo).
3. Un socio cancela y queda debajo de la meta: entra en gracia, conserva el beneficio, recibe aviso.
4. Sigue debajo al mes siguiente: se retira el cupón y vuelve a pagar.
5. Embajador con dos peludos en el nivel de «dos gratis»: los dos quedan en $0.
6. Embajador dado de baja del programa: se retira el beneficio y se cierra su historial.
7. Un socio referido pide reembolso: deja de contar.

## 10. Tiempos

Con las decisiones de §8 cerradas, la construcción son unos pocos días de trabajo más las pruebas.
**El anuncio del 1 de octubre no depende de esto:** se puede anunciar el programa y aplicar los
primeros beneficios a mano — hoy nadie está cerca de una meta, hay **un solo referido registrado**
en todo el sistema — y dejar la automatización lista después, ya probada.
