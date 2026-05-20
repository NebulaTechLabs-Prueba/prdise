import { z } from "zod";

/**
 * Schemas zod para Server Actions de bookings.
 *
 * Pagos offline (`ath`, `bank`) requieren un `claimData` JSON con la evidencia
 * que el usuario reportó (referencia, número de transferencia, URL de recibo,
 * etc.). Ese JSON se persiste parcialmente en `payments.notes` /
 * `payments.external_ref` / `payments.receipt_url`.
 */

export const itemTypeSchema = z.enum(["stay", "tour", "transfer"], {
  errorMap: () => ({ message: "Tipo de ítem inválido" }),
});

const itemIdSchema = z
  .string({ required_error: "Identificador del ítem requerido" })
  .trim()
  .min(1, "Identificador del ítem requerido")
  .max(200, "Identificador inválido");

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (formato YYYY-MM-DD)");

const isoTimeSchema = z
  .string()
  .trim()
  .regex(/^\d{2}:\d{2}(:\d{2})?$/, "Hora inválida (formato HH:MM)");

const paxSchema = z.coerce
  .number({ invalid_type_error: "Cantidad de personas inválida" })
  .int("La cantidad de personas debe ser un entero")
  .min(1, "Debe haber al menos 1 persona")
  .max(100, "Cantidad de personas demasiado alta");

const totalCentsSchema = z.coerce
  .number({ invalid_type_error: "Monto total inválido" })
  .int("El monto total debe estar en centavos enteros")
  .min(0, "El monto total no puede ser negativo")
  .max(100_000_000, "Monto total fuera de rango");

const notesSchema = z
  .string()
  .trim()
  .max(2000, "Las notas son demasiado largas")
  .optional()
  .or(z.literal(""));

export const offlinePaymentMethodSchema = z.enum(["ath", "bank"], {
  errorMap: () => ({ message: "Método de pago offline inválido" }),
});

/**
 * `claimData` es un JSON con evidencia del pago reportado. Forma esperada:
 *   - ATH Móvil: { phone?: string, externalRef?: string, receiptUrl?: string, note?: string }
 *   - Bank:      { bankRef?: string, externalRef?: string, receiptUrl?: string, note?: string }
 *
 * Aceptamos un objeto laxo (`passthrough`) para no bloquear evolución.
 * Validamos solo los campos que mapeamos a columnas conocidas.
 */
export const claimDataSchema = z
  .object({
    phone: z.string().trim().max(40).optional(),
    bankRef: z.string().trim().max(120).optional(),
    externalRef: z.string().trim().max(120).optional(),
    receiptUrl: z
      .string()
      .trim()
      .max(2000)
      .url("URL del recibo inválida")
      .optional()
      .or(z.literal("")),
    note: z.string().trim().max(1000).optional(),
  })
  .passthrough();

export const createBookingOfflineSchema = z
  .object({
    itemType: itemTypeSchema,
    itemId: itemIdSchema,
    startDate: isoDateSchema,
    endDate: isoDateSchema.optional().or(z.literal("")),
    startTime: isoTimeSchema.optional().or(z.literal("")),
    pax: paxSchema,
    totalCents: totalCentsSchema,
    notes: notesSchema,
    paymentMethod: offlinePaymentMethodSchema,
    claimData: claimDataSchema.optional(),
  })
  .superRefine((val, ctx) => {
    if (val.itemType === "stay") {
      if (!val.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endDate"],
          message: "La fecha de salida es requerida",
        });
      }
      if (val.endDate && val.endDate <= val.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endDate"],
          message: "La fecha de salida debe ser posterior a la de entrada",
        });
      }
    }
  });

export const cancelBookingSchema = z.object({
  bookingId: z
    .string({ required_error: "Identificador de la reserva requerido" })
    .uuid("Identificador de la reserva inválido"),
});

export type CreateBookingOfflineInput = z.infer<typeof createBookingOfflineSchema>;
export type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
export type ClaimData = z.infer<typeof claimDataSchema>;
