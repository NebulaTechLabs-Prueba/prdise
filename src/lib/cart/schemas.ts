import { z } from "zod";

/**
 * Schemas zod para las Server Actions del carrito.
 *
 * Mensajes de error siempre en español (UI los muestra al usuario).
 * El frontend envía slugs (`stays.slug`, `tours.slug`, `transfer_routes` no
 * tiene slug — para transfers se envía el UUID directamente como `itemId`).
 */

export const itemTypeSchema = z.enum(["stay", "tour", "transfer"], {
  errorMap: () => ({ message: "Tipo de ítem inválido" }),
});

// Acepta slug (stay/tour) o UUID directo (transfer). Validación fina se hace
// en la action al resolver el ID.
const itemIdSchema = z
  .string({ required_error: "Identificador del ítem requerido" })
  .trim()
  .min(1, "Identificador del ítem requerido")
  .max(200, "Identificador inválido");

const isoDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (formato YYYY-MM-DD)");

const paxSchema = z.coerce
  .number({ invalid_type_error: "Cantidad de personas inválida" })
  .int("La cantidad de personas debe ser un entero")
  .min(1, "Debe haber al menos 1 persona")
  .max(100, "Cantidad de personas demasiado alta");

const notesSchema = z
  .string()
  .trim()
  .max(1000, "Las notas son demasiado largas")
  .optional()
  .or(z.literal(""));

const cartItemIdSchema = z
  .string({ required_error: "Identificador del ítem del carrito requerido" })
  .uuid("Identificador del ítem del carrito inválido");

export const addToCartSchema = z
  .object({
    itemType: itemTypeSchema,
    itemId: itemIdSchema,
    startDate: isoDateSchema.optional().or(z.literal("")),
    endDate: isoDateSchema.optional().or(z.literal("")),
    pax: paxSchema,
    notes: notesSchema,
  })
  .superRefine((val, ctx) => {
    // Stays: requieren start y end (check-in / check-out).
    if (val.itemType === "stay") {
      if (!val.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["startDate"],
          message: "La fecha de entrada es requerida",
        });
      }
      if (!val.endDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endDate"],
          message: "La fecha de salida es requerida",
        });
      }
      if (val.startDate && val.endDate && val.endDate <= val.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["endDate"],
          message: "La fecha de salida debe ser posterior a la de entrada",
        });
      }
    }
    // Tours / Transfers: requieren al menos start_date (la fecha del servicio).
    if (val.itemType === "tour" || val.itemType === "transfer") {
      if (!val.startDate) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["startDate"],
          message: "La fecha del servicio es requerida",
        });
      }
    }
  });

export const removeFromCartSchema = z.object({
  cartItemId: cartItemIdSchema,
});

export const updateCartItemSchema = z
  .object({
    cartItemId: cartItemIdSchema,
    startDate: isoDateSchema.optional().or(z.literal("")),
    endDate: isoDateSchema.optional().or(z.literal("")),
    pax: paxSchema.optional(),
    notes: notesSchema,
  })
  .superRefine((val, ctx) => {
    if (val.startDate && val.endDate && val.endDate <= val.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["endDate"],
        message: "La fecha final debe ser posterior a la inicial",
      });
    }
  });

export type AddToCartInput = z.infer<typeof addToCartSchema>;
export type RemoveFromCartInput = z.infer<typeof removeFromCartSchema>;
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
