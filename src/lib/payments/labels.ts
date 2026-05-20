/**
 * Labels bilingües ES/EN para enums de pagos y bookings.
 *
 * Los enums vienen de la DB (ver `database.types.ts`). Esta capa los traduce
 * a texto visible para la UI sin acoplar el JSX a strings hardcoded en un
 * solo idioma.
 *
 * Convención: si `lang` no es `"en"`, se asume `"es"` (default del proyecto).
 */

import type { Database } from "@/lib/supabase/database.types";
import { PAYMENT_METHODS, type PaymentMethodId } from "./registry";

export type Lang = "es" | "en";

export type PaymentStatus = Database["public"]["Enums"]["payment_status"];
export type BookingStatus = Database["public"]["Enums"]["booking_status"];
export type PaymentMethod = Database["public"]["Enums"]["payment_method"];

// ---------- Payment method --------------------------------------------------

/**
 * Label visible del método de pago. Usa el `label` del registro para mantener
 * una sola fuente de verdad.
 */
export function paymentMethodLabel(method: PaymentMethod, lang: Lang = "es"): string {
  const cfg = PAYMENT_METHODS[method as PaymentMethodId];
  if (!cfg) return String(method);
  return lang === "en" ? cfg.label.en : cfg.label.es;
}

// ---------- Payment status --------------------------------------------------

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, { es: string; en: string }> = {
  pending: { es: "Pendiente", en: "Pending" },
  claimed: { es: "Reportado", en: "Reported" },
  confirmed: { es: "Confirmado", en: "Confirmed" },
  rejected: { es: "Rechazado", en: "Rejected" },
  refunded: { es: "Reembolsado", en: "Refunded" },
};

export function paymentStatusLabel(status: PaymentStatus, lang: Lang = "es"): string {
  const entry = PAYMENT_STATUS_LABELS[status];
  if (!entry) return String(status);
  return lang === "en" ? entry.en : entry.es;
}

// ---------- Booking status --------------------------------------------------

const BOOKING_STATUS_LABELS: Record<BookingStatus, { es: string; en: string }> = {
  pending: { es: "Pendiente", en: "Pending" },
  pending_payment: { es: "Esperando pago", en: "Awaiting payment" },
  confirmed: { es: "Confirmada", en: "Confirmed" },
  cancelled: { es: "Cancelada", en: "Cancelled" },
  completed: { es: "Completada", en: "Completed" },
  refunded: { es: "Reembolsada", en: "Refunded" },
};

export function bookingStatusLabel(status: BookingStatus, lang: Lang = "es"): string {
  const entry = BOOKING_STATUS_LABELS[status];
  if (!entry) return String(status);
  return lang === "en" ? entry.en : entry.es;
}

// ---------- Status color hint (para badges en la UI) -----------------------

export type StatusTone = "neutral" | "info" | "warning" | "success" | "danger";

export function paymentStatusTone(status: PaymentStatus): StatusTone {
  switch (status) {
    case "pending":
      return "neutral";
    case "claimed":
      return "info";
    case "confirmed":
      return "success";
    case "rejected":
      return "danger";
    case "refunded":
      return "warning";
    default:
      return "neutral";
  }
}

export function bookingStatusTone(status: BookingStatus): StatusTone {
  switch (status) {
    case "pending":
    case "pending_payment":
      return "warning";
    case "confirmed":
      return "info";
    case "completed":
      return "success";
    case "cancelled":
      return "danger";
    case "refunded":
      return "neutral";
    default:
      return "neutral";
  }
}
