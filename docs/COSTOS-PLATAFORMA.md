# Costos de plataforma — punto de partida para construir

> **Estado: por construir.** Este documento no describe algo que exista; es el
> arranque para una sesión de diseño. Lee `ESTADO-DEL-PROYECTO.md` primero.
>
> **Dónde va:** Admin → Finanzas, bloque nuevo. **Quién lo ve:** super admin
> (decisión a confirmar, ver punto 6).

---

## 1. Qué pregunta tiene que contestar la pantalla

Hoy `/admin/finanzas` muestra lo que **entra**: suscripciones, reintegros del
mes, comisiones por pagar. No muestra lo que **cuesta tener la plataforma
prendida**, así que nadie puede responder:

1. ¿Cuánto cuesta operar Pata Amiga este mes?
2. ¿Cuánto de eso es fijo (planes) y cuánto varía con el uso (IA, mensajes)?
3. **¿Cuánto cuesta sostener a cada miembro activo?**
4. ¿Estamos ganando o perdiendo dinero este mes?

La cuarta es la que importa. Hoy se responde a mano, con capturas de pantalla de
seis proveedores.

---

## 2. De dónde sale cada costo

Esto es lo que define la arquitectura: **no todos los costos se consiguen
igual**, y hay que ser honesto sobre cuáles son automáticos y cuáles no.

| Proveedor | Qué se cobra | Cómo lo obtenemos |
|---|---|---|
| **Anthropic** (agentes IA) | Por token consumido | ✅ **Ya lo tenemos.** `ai_usage.cost_cents` guarda el costo real de cada llamada, calculado con los precios y el tipo de cambio de Ajustes de IA |
| **Stripe** | Comisión por transacción | ✅ **Automatizable.** Las transacciones de balance de Stripe traen su comisión; se puede leer por API *(verificar antes de prometerlo)* |
| **WhatsApp / Meta** | Por conversación iniciada | ⚠️ Meta cobra por conversación. Habría que ver si su API expone el consumo; si no, va manual |
| **Vercel** | Plan Pro + asientos + excedentes de uso | ✋ Manual. El monto varía con el uso y no hay una lectura simple |
| **Supabase** | Plan + almacenamiento y tráfico | ✋ Manual |
| **Resend** | Plan + volumen de correos | ✋ Manual *(el volumen enviado sí lo sabemos nosotros)* |
| **Google Maps** | Por consulta | ✋ Manual |
| **Dominio** | Anual | ✋ Manual, se prorratea |
| **Pauta publicitaria** | Meta Ads | ✋ Manual, **y hay que decidir si cuenta aquí** (ver punto 6) |

**Consecuencia de diseño:** la pieza central **no** es una integración con seis
APIs. Es una **tabla de costos donde se capturan los montos del mes**, más
enchufes automáticos donde ya tenemos el dato. Empezar por las integraciones es
construir lo difícil para resolver lo fácil.

---

## 3. Modelo de datos, primer boceto

```
platform_costs
  id
  proveedor          -- 'vercel' | 'supabase' | 'anthropic' | 'stripe' | ...
  concepto           -- texto libre: "Plan Pro", "Asiento extra"
  categoria          -- 'infraestructura' | 'ia' | 'mensajeria' | 'comisiones' | 'marketing'
  periodo            -- date, el mes al que pertenece (día 1)
  monto_centavos     -- SIEMPRE en centavos, como el resto del sistema
  moneda             -- 'MXN' | 'USD'
  monto_mxn_centavos -- el convertido, congelado al capturar
  tipo_cambio        -- con qué tipo de cambio se convirtió
  origen             -- 'manual' | 'automatico'
  recurrente         -- si se repite solo cada mes
  nota
  capturado_por, created_at
```

**Tres decisiones que ya vienen tomadas del resto del sistema y conviene
respetar:**

1. **Centavos enteros, nunca decimales.** Como `value_cents` y `cost_cents`.
2. **El tipo de cambio se congela al capturar.** Si el dólar se mueve, el costo
   de marzo no puede cambiar tres meses después. Ya existe
   `ia_tipo_cambio_mxn` en Ajustes de IA — **reusarlo, no crear otro**.
3. **El mes se calcula con `inicioDelMes()`** de `src/lib/zona-horaria.ts`. Un
   costo del 31 a las 8 de la noche pertenece a ese mes, no al siguiente.

---

## 4. Lo que ya existe y hay que reusar

No empezar de cero:

| Pieza | Dónde | Para qué |
|---|---|---|
| Costo real de la IA | `ai_usage.cost_cents` | La única fuente automática que ya funciona |
| Precios y tipo de cambio | Ajustes de IA (`site_settings`) | No duplicar la configuración de moneda |
| Rangos de mes en hora de México | `src/lib/zona-horaria.ts` | `inicioDelMes()`, `finDelDia()` |
| Formato de pesos | `formatMxn` en `src/lib/format.ts` | Que se vea igual que el resto |
| Exportar a CSV con registro | `src/lib/tableros/exportar.ts` | El contador va a querer bajarlo |
| Fichas de detalle | `DetailModal` en `components/panel/` | Ya se usa en finanzas |
| Métricas del tablero | `src/lib/tableros/metricas.ts` | De ahí salen los ingresos con los que se compara |

---

## 5. Qué debería mostrar la pantalla

Un bloque en Finanzas, con el mes en curso y su comparación contra el anterior:

- **Costo total del mes**, partido en fijo y variable.
- **Desglose por proveedor**, ordenado de mayor a menor.
- **Costo por miembro activo** — el número que de verdad se usa para decidir.
- **Margen del mes**: ingresos − costos. En rojo si es negativo, sin adornos.
- **Tendencia de los últimos 6 meses**, para ver si el costo crece más rápido
  que los miembros.
- Aviso de **meses sin capturar**: si nadie metió los costos de un mes, la
  pantalla debe decirlo, **no mostrar un total incompleto como si fuera real**.

Ese último punto no es un detalle. Un tablero de costos que enseña $8,000
cuando en realidad faltó capturar Vercel es peor que no tener tablero.

---

## 6. Decisiones abiertas (resolver antes de escribir código)

1. **¿La pauta publicitaria cuenta como costo de plataforma?** Son ~$17,000 al
   mes contra unos cientos de infraestructura. Si entra, se come la gráfica y
   deja de servir para lo que se pidió; si no entra, el margen que muestre no es
   el margen real del negocio. → Sugerencia: **dos totales separados**, "operar
   la plataforma" y "adquisición".
2. **¿Quién lo ve?** ¿Solo super admin, o también admin? Hoy Finanzas ya tiene
   bloques sensibles; conviene seguir ese mismo criterio.
3. **¿Quién captura y cuándo?** Sin un responsable con fecha, la tabla se llena
   dos meses y se abandona. ¿Recordatorio automático el día 5?
4. **¿Las comisiones de Stripe son costo o menos ingreso?** Contablemente suele
   ser lo segundo. Hay que decidirlo una vez y ser consistente.
5. **¿Se prorratean los pagos anuales** (dominio, planes anuales) o se cargan
   completos en su mes?

---

## 7. Qué NO debe hacer

- **No estimar.** Si un proveedor no está capturado, la pantalla lo dice; no
  inventa un promedio.
- **No guardar llaves de facturación** de los proveedores en la base para
  "automatizar" — son llaves con acceso a información de pago.
- **No mezclar monedas en un total.** Todo se convierte a MXN al capturar y se
  guarda el tipo de cambio usado.

---

## 8. Cómo se verifica que quedó bien

- Capturar un mes completo a mano y que el total cuadre con la suma de las
  facturas reales de los proveedores.
- Que el costo de IA del mes coincida con `sum(ai_usage.cost_cents)` del mismo
  rango, calculado por SQL directo.
- Que un mes sin capturar se vea **como incompleto**, no como $0.
- Que el mes se corte igual en local y en Vercel (probar con `TZ=UTC`).
- 375 px.

---

## 9. Por dónde empezar

1. Migración con la tabla y el catálogo de proveedores.
2. Captura manual + listado por mes (esto ya resuelve el 80% del pedido).
3. Enchufe automático de la IA, que es el dato que ya existe.
4. Comparación contra ingresos y costo por miembro.
5. Al final, y solo si vale la pena: automatizar Stripe.
