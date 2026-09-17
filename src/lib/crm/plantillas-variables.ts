/**
 * Las variables de las plantillas, aparte de `plantillas.ts` porque las usa el
 * editor (componente de cliente) y `plantillas.ts` lee la oferta del $599 con
 * módulos de servidor (Stripe) que no deben viajar al navegador.
 */

/** Variables disponibles, con lo que significan (se muestran en el editor). */
export const VARIABLES = [
  { clave: "nombre", que: "Nombre del contacto" },
  { clave: "apellido", que: "Apellidos del contacto" },
  { clave: "correo", que: "Su correo principal" },
  { clave: "telefono", que: "Su teléfono principal" },
  { clave: "etapa", que: "Etapa de su oportunidad" },
  // Membresía $599 (sección 7): el precio es el del plan que se vende hoy, por
  // peludo; ya no se escribe el número del $159 en la etiqueta.
  { clave: "plan_mensual", que: "Precio mensual de la membresía que se vende hoy (primer peludo)" },
  { clave: "plan_anual", que: "Precio anual de la membresía que se vende hoy (primer peludo)" },
  { clave: "asesor", que: "Nombre de quien escribe" },
  { clave: "liga_registro", que: "Liga para registrarse" },
] as const;
