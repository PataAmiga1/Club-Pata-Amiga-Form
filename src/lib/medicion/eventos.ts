/**
 * Ids de evento compartidos por el navegador (píxel) y el servidor (CAPI).
 *
 * Meta deduplica un evento que llega por los dos lados SOLO si el nombre y el
 * `event_id` coinciden. Por eso el id no se inventa en cada lado: se deriva de
 * algo que los dos conocen (el peludo, la sesión de pago, la suscripción).
 * Puro, sin dependencias: lo usan componentes de cliente y del servidor.
 */

/** CompleteRegistration — un peludo recién registrado (alta o desde la cuenta). */
export const idRegistroPeludo = (petId: string) => `registro-peludo-${petId}`;

/** Purchase pagado por Stripe Checkout (alta, peludo adicional, anual MSI). */
export const idCompraCheckout = (sesionId: string) => `compra-${sesionId}`;

/** Purchase de un peludo activado con la tarjeta guardada (sin Checkout). */
export const idCompraSuscripcion = (suscripcionId: string) => `compra-${suscripcionId}`;

/** Lead — la cuenta recién creada (solo navegador). */
export const idCuentaCreada = (userId: string) => `cuenta-${userId}`;

/** Lo que el servidor le pasa al navegador para medir un evento. */
export type MedicionDeEvento = {
  eventoId: string;
  valorCentavos?: number;
  moneda?: string;
  contenidoId?: string;
  /** Id de la transacción (Purchase sin Checkout: la suscripción). */
  transaccion?: string;
};
