/**
 * Registro de métodos de pago — habilitable / deshabilitable sin tocar UI.
 *
 * Online: stripe, paypal — requieren claves del procesador (stand-by).
 * Offline: ath, bank — siempre disponibles; reconciliación manual del admin.
 */

export type PaymentMethodId = "stripe" | "paypal" | "ath" | "bank";

export type PaymentMethodConfig = {
  id: PaymentMethodId;
  kind: "online" | "offline";
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
