import { z } from "zod";

// ─── Helpers ────────────────────────────────────────────────────────────────

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const uuidSchema = z
  .string({ required_error: "Identificador requerido" })
  .trim()
  .min(1, "Identificador requerido")
  .regex(UUID_REGEX, "Identificador inválido");

const optionalText = (max: number, label = "Campo") =>
  z
    .string()
    .trim()
    .max(max, `${label} excede los ${max} caracteres`)
    .optional()
    .or(z.literal(""));

const optionalNonEmptyText = (max: number, label = "Campo") =>
  z
    .string()
    .trim()
    .min(1, `${label} requerido`)
    .max(max, `${label} excede los ${max} caracteres`);

/**
 * Parsea un valor de FormData que puede ser:
 *  - string JSON: '["a","b"]' → ["a","b"]
 *  - string vacío → []
 *  - null/undefined → []
 *
 * Para inputs múltiples con `name="amenities"` (FormData.getAll), preferí
 * pasar el array ya construido antes de llamar al schema.
 */
export function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((v): v is string => typeof v === "string");
  }
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (trimmed === "") return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === "string");
    }
  } catch {
    // Fallback: lista separada por comas.
    return trimmed
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }
  return [];
}

const stringArraySchema = z
  .array(z.string().trim().min(1).max(120))
  .max(50, "Máximo 50 elementos");

const priceCentsSchema = z.coerce
  .number({ invalid_type_error: "Precio inválido" })
  .int("El precio debe ser entero (centavos)")
  .min(0, "El precio no puede ser negativo")
  .max(1_000_000_00, "Precio fuera de rango");

const positiveIntSchema = (label: string) =>
  z.coerce
    .number({ invalid_type_error: `${label} inválido` })
    .int(`${label} debe ser entero`)
    .min(0, `${label} no puede ser negativo`)
    .max(9999, `${label} fuera de rango`);

const latSchema = z.coerce
  .number({ invalid_type_error: "Latitud inválida" })
  .min(-90, "Latitud fuera de rango")
  .max(90, "Latitud fuera de rango")
  .optional()
  .nullable();

const lngSchema = z.coerce
  .number({ invalid_type_error: "Longitud inválida" })
  .min(-180, "Longitud fuera de rango")
  .max(180, "Longitud fuera de rango")
  .optional()
  .nullable();

const booleanFlagSchema = z
  .union([z.boolean(), z.string()])
  .transform((v) => {
    if (typeof v === "boolean") return v;
    const norm = v.trim().toLowerCase();
    return norm === "true" || norm === "on" || norm === "1" || norm === "yes";
  });

const slugSchema = z
  .string({ required_error: "Slug requerido" })
  .trim()
  .min(1, "Slug requerido")
  .max(120, "Slug demasiado largo")
  .regex(/^[a-z0-9-]+$/i, "Slug solo admite letras, números y guiones");

// ─── Payments ───────────────────────────────────────────────────────────────

export const confirmPaymentSchema = z.object({
  paymentId: uuidSchema,
  notes: optionalText(500, "Notas"),
});

export const rejectPaymentSchema = z.object({
  paymentId: uuidSchema,
  reason: z
    .string({ required_error: "Motivo requerido" })
    .trim()
    .min(3, "El motivo es demasiado corto")
    .max(500, "El motivo es demasiado largo"),
});

// ─── Bookings ───────────────────────────────────────────────────────────────

export const BOOKING_STATUSES = [
  "pending",
  "pending_payment",
  "confirmed",
  "cancelled",
  "completed",
  "refunded",
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number];

export const ITEM_TYPES = ["stay", "tour", "transfer"] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const listBookingsOptsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(25).optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
  itemType: z.enum(ITEM_TYPES).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
});

export type ListBookingsOpts = z.infer<typeof listBookingsOptsSchema>;

export const updateBookingStatusSchema = z.object({
  bookingId: uuidSchema,
  nextStatus: z.enum(BOOKING_STATUSES, {
    errorMap: () => ({ message: "Estado de reserva inválido" }),
  }),
});

export const completeBookingSchema = z.object({
  bookingId: uuidSchema,
});

// ─── Catalog: Stays ─────────────────────────────────────────────────────────

const stayBaseSchema = z.object({
  slug: slugSchema,
  title_es: optionalNonEmptyText(160, "Título (ES)"),
  title_en: optionalText(160, "Título (EN)"),
  description_es: optionalText(8000, "Descripción (ES)"),
  description_en: optionalText(8000, "Descripción (EN)"),
  short_desc_es: optionalText(500, "Descripción corta (ES)"),
  short_desc_en: optionalText(500, "Descripción corta (EN)"),
  price_cents: priceCentsSchema,
  max_guests: positiveIntSchema("Capacidad"),
  bedrooms: positiveIntSchema("Habitaciones"),
  bathrooms: positiveIntSchema("Baños"),
  amenities: stringArraySchema.default([]),
  images: stringArraySchema.default([]),
  location: optionalText(200, "Ubicación"),
  lat: latSchema,
  lng: lngSchema,
  featured: booleanFlagSchema.default(false),
  active: booleanFlagSchema.default(true),
});

export const createStaySchema = stayBaseSchema;
export const updateStaySchema = stayBaseSchema.extend({ id: uuidSchema });
export const deleteStaySchema = z.object({ id: uuidSchema });

// ─── Catalog: Tours ─────────────────────────────────────────────────────────

const tourBaseSchema = z.object({
  slug: slugSchema,
  title_es: optionalNonEmptyText(160, "Título (ES)"),
  title_en: optionalText(160, "Título (EN)"),
  description_es: optionalText(8000, "Descripción (ES)"),
  description_en: optionalText(8000, "Descripción (EN)"),
  short_desc_es: optionalText(500, "Descripción corta (ES)"),
  short_desc_en: optionalText(500, "Descripción corta (EN)"),
  price_cents: priceCentsSchema,
  duration_minutes: z.coerce
    .number({ invalid_type_error: "Duración inválida" })
    .int("Duración debe ser entera")
    .min(1, "Duración mínima 1 minuto")
    .max(60 * 24 * 14, "Duración fuera de rango"),
  max_pax: positiveIntSchema("Capacidad"),
  difficulty: optionalText(40, "Dificultad"),
  meeting_point: optionalText(200, "Punto de encuentro"),
  includes: stringArraySchema.default([]),
  images: stringArraySchema.default([]),
  location: optionalText(200, "Ubicación"),
  lat: latSchema,
  lng: lngSchema,
  featured: booleanFlagSchema.default(false),
  active: booleanFlagSchema.default(true),
});

export const createTourSchema = tourBaseSchema;
export const updateTourSchema = tourBaseSchema.extend({ id: uuidSchema });
export const deleteTourSchema = z.object({ id: uuidSchema });

// ─── Catalog: Transfer Routes ───────────────────────────────────────────────

const transferRouteBaseSchema = z.object({
  from_location: optionalNonEmptyText(160, "Origen"),
  to_location: optionalNonEmptyText(160, "Destino"),
  base_price_cents: priceCentsSchema,
  distance_km: z.coerce
    .number({ invalid_type_error: "Distancia inválida" })
    .min(0, "Distancia inválida")
    .max(100000, "Distancia fuera de rango")
    .optional()
    .nullable(),
  duration_minutes: z.coerce
    .number({ invalid_type_error: "Duración inválida" })
    .int("Duración entera")
    .min(0, "Duración inválida")
    .max(60 * 24, "Duración fuera de rango")
    .optional()
    .nullable(),
  max_pax: positiveIntSchema("Capacidad"),
  active: booleanFlagSchema.default(true),
});

export const createTransferRouteSchema = transferRouteBaseSchema;
export const updateTransferRouteSchema = transferRouteBaseSchema.extend({
  id: uuidSchema,
});
export const deleteTransferRouteSchema = z.object({ id: uuidSchema });

// ─── Catalog: Vehicles ──────────────────────────────────────────────────────

const vehicleBaseSchema = z.object({
  name: optionalNonEmptyText(120, "Nombre"),
  type: optionalText(60, "Tipo"),
  max_pax: positiveIntSchema("Capacidad"),
  max_luggage: positiveIntSchema("Equipaje"),
  price_cents: priceCentsSchema.optional().nullable(),
  image: optionalText(300, "Imagen"),
  active: booleanFlagSchema.default(true),
});

export const createVehicleSchema = vehicleBaseSchema;
export const updateVehicleSchema = vehicleBaseSchema.extend({ id: uuidSchema });
export const deleteVehicleSchema = z.object({ id: uuidSchema });

// ─── Users ──────────────────────────────────────────────────────────────────

export const USER_ROLES = ["admin", "manager", "employee", "user"] as const;
export type UserRoleLiteral = (typeof USER_ROLES)[number];

export const USER_STATUSES = ["active", "inactive"] as const;
export type UserStatusLiteral = (typeof USER_STATUSES)[number];

export const listUsersOptsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1).optional(),
  pageSize: z.coerce.number().int().min(1).max(100).default(25).optional(),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  search: z.string().trim().max(120).optional(),
});

export type ListUsersOpts = z.infer<typeof listUsersOptsSchema>;

export const updateUserRoleSchema = z.object({
  targetUserId: uuidSchema,
  newRole: z.enum(USER_ROLES, {
    errorMap: () => ({ message: "Rol inválido" }),
  }),
});

export const toggleUserStatusSchema = z.object({
  targetUserId: uuidSchema,
});

// ─── Inferred input types ───────────────────────────────────────────────────

export type ConfirmPaymentInput = z.infer<typeof confirmPaymentSchema>;
export type RejectPaymentInput = z.infer<typeof rejectPaymentSchema>;
export type UpdateBookingStatusInput = z.infer<typeof updateBookingStatusSchema>;
export type CompleteBookingInput = z.infer<typeof completeBookingSchema>;
export type CreateStayInput = z.infer<typeof createStaySchema>;
export type UpdateStayInput = z.infer<typeof updateStaySchema>;
export type CreateTourInput = z.infer<typeof createTourSchema>;
export type UpdateTourInput = z.infer<typeof updateTourSchema>;
export type CreateTransferRouteInput = z.infer<typeof createTransferRouteSchema>;
export type UpdateTransferRouteInput = z.infer<typeof updateTransferRouteSchema>;
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
export type ToggleUserStatusInput = z.infer<typeof toggleUserStatusSchema>;
