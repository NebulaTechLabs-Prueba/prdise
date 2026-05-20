/**
 * Registro de métodos de pago — habilitable / deshabilitable sin tocar UI.
 *
 * Online: stripe, paypal — requieren claves del procesador (stand-by).
 * Offline: ath, bank — siempre disponibles; reconciliación manual del admin.
 *
 * Los helpers `getOnlinePaymentMethods` / `getOfflinePaymentMethods` filtran
 * por el flag `enabled` para que la UI muestre dinámicamente solo los métodos
 * activos. Cuando lleguen las credenciales online basta con flippear `enabled`
 * a `true` en este archivo — no requiere otros cambios de código.
 */

export type PaymentMethodId = "stripe" | "paypal" | "ath" | "bank";
export type PaymentMethodKind = "online" | "offline";

export type PaymentMethodConfig = {
  id: PaymentMethodId;
  kind: PaymentMethodKind;
  enabled: boolean;
  label: { es: string; en: string };
};

export const PAYMENT_METHODS: Record<PaymentMethodId, PaymentMethodConfig> = {
  stripe: { id: "stripe", kind: "online",  enabled: false, label: { es: "Tarjeta",      en: "Card" } },
  paypal: { id: "paypal", kind: "online",  enabled: false, label: { es: "PayPal",       en: "PayPal" } },
  ath:    { id: "ath",    kind: "offline", enabled: true,  label: { es: "ATH Móvil",    en: "ATH Móvil" } },
  bank:   { id: "bank",   kind: "offline", enabled: true,  label: { es: "Transferencia bancaria", en: "Bank Transfer" } },
};

export function getEnabledPaymentMethods(): PaymentMethodConfig[] {
  return Object.values(PAYMENT_METHODS).filter((m) => m.enabled);
}

/**
 * Métodos online habilitados (Stripe, PayPal). Devuelve `[]` mientras los
 * flags estén en `false` (estado actual: pre-credenciales).
 */
export function getOnlinePaymentMethods(): PaymentMethodConfig[] {
  return Object.values(PAYMENT_METHODS).filter(
    (m) => m.kind === "online" && m.enabled
  );
}

/**
 * Métodos offline habilitados (ATH Móvil, transferencia bancaria). Son los
 * que el admin reconcilia manualmente desde el panel.
 */
export function getOfflinePaymentMethods(): PaymentMethodConfig[] {
  return Object.values(PAYMENT_METHODS).filter(
    (m) => m.kind === "offline" && m.enabled
  );
}

/**
 * Devuelve `true` si el método existe en el registro y está habilitado.
 */
export function isPaymentMethodEnabled(id: string): id is PaymentMethodId {
  const method = (PAYMENT_METHODS as Record<string, PaymentMethodConfig | undefined>)[id];
  return Boolean(method?.enabled);
}

/**
 * Devuelve el `kind` (online/offline) de un método dado, o `null` si no existe.
 */
export function getPaymentMethodKind(id: string): PaymentMethodKind | null {
  const method = (PAYMENT_METHODS as Record<string, PaymentMethodConfig | undefined>)[id];
  return method?.kind ?? null;
}
