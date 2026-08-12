# Matriz de información por rol — admin vs super admin

> Petición del equipo (5-ago-2026): dejar por escrito qué ve cada rol para
> que las pruebas no confundan diferencias intencionales con errores.
> **El super admin es la referencia**: ve todo. El admin (comité) ve la
> operación diaria sin los datos sensibles.
>
> La regla en código: los bloques sensibles usan `SensitiveBlock` (se ocultan
> si `isSuper` es falso) y las acciones exclusivas usan `requireAdmin(true)`.

## Qué ve cada rol

| Superficie | Admin (comité) | Super admin |
|---|---|---|
| Resumen (KPIs, gráficas, campana, salud del sistema) | ✅ | ✅ |
| Notificaciones | ✅ | ✅ |
| Mascotas: lista, ficha, aprobar/denegar, solicitar información | ✅ | ✅ |
| Mascotas: tabs **Apelaciones** y **Bajas** | ❌ | ✅ |
| Reintegros: lista, detalle, resolver, layout bancario | ✅ | ✅ |
| Embajadores: lista, solicitudes, aprobar/rechazar, corte mensual, tablero por embajador | ✅ | ✅ |
| Embajadores: **CURP, fecha de nacimiento, RFC, banco, CLABE, titular, INE** (bloque sensible del popup) | ❌ | ✅ |
| Embajadores: tab **Bajas** y **dar de baja** | ❌ | ✅ |
| Centros: lista, solicitudes, aprobar/rechazar, popup completo | ✅ | ✅ |
| Centros: tabs **Apelaciones** y **Bajas** | ❌ | ✅ |
| Miembros: tabla (estatus, plan, solicitud, perfil, factura, mascotas) y búsqueda | ✅ | ✅ |
| Miembro (detalle): contacto, membresía, facturación CFDI, mascotas, reintegros, apelaciones*, cancelaciones | ✅ | ✅ |
| Miembro (detalle): **Zona de baja** (dar de baja la cuenta) | ❌ | ✅ |
| Apelaciones (menú) | ❌ | ✅ |
| Finanzas (MRR, cobros Stripe, layouts) | ✅ | ✅ |
| Vet 24/7 y Conversaciones | ✅ | ✅ |
| Marketing (Landings, Comunicados, Sitio web) | ✅ | ✅ |
| Ajustes de IA (precios de modelos, tope diario) | ❌ | ✅ |

\* El detalle del miembro muestra el conteo de apelaciones a ambos; la
resolución vive en el menú Apelaciones (solo super admin).

## Datos sensibles — regla general

CURP, fecha de nacimiento, RFC, datos bancarios (banco, CLABE, titular),
INE y dirección completa **solo los ve el super admin** cuando aparecen en
bloques sensibles de popups. En el detalle del miembro, el comité sí ve la
dirección y la CURP porque las necesita para validar reintegros — si el
cliente quiere restringirlas también ahí, es un cambio de una línea
(envolverlas en `SensitiveBlock`).

## Acciones exclusivas del super admin (`requireAdmin(true)`)

- Dar de baja la cuenta de un miembro (`deactivateMemberAccount`)
- Dar de baja a un embajador (`deactivateAmbassador`)
- Saltar el período de espera de una mascota (`bypassWaitingPeriod`)
- Resolver apelaciones (`resolveAppeal`)

## Cómo mantener esta matriz

Cuando se agregue una superficie o un dato nuevo, decidir en qué columna
cae y actualizar esta tabla en el mismo PR. El equipo prueba contra esta
matriz: si el admin ve algo de la columna "solo super admin" (o al revés),
ESO es un bug.
