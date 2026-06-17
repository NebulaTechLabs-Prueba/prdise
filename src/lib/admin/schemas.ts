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

const partnerLinkSchema = z.object({
  partner_id: z
    .union([uuidSchema, z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  partner_url: z
    .string()
    .trim()
    .max(2000, "URL del partner demasiado larga")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v ? v : null)),
});

// ─── Pricing extras shared ─────────────────────────────────────────────────
// Extras: cada add-on tiene labels bilingües, precio en cents y su unidad
// (por persona, por hora, etc.). Habilita pricing mixto del PM 2026-06-10.
const pricingExtraSchema = z.object({
  label_es: optionalText(120, "Etiqueta (ES)"),
  label_en: optionalText(120, "Etiqueta (EN)"),
  price_cents: priceCentsSchema,
  unit: z.enum(["per_person", "per_hour", "per_unit", "per_attraction", "per_night"]).default("per_unit"),
});
const pricingExtrasArraySchema = z
  .array(pricingExtraSchema)
  .max(20, "Máximo 20 extras")
  .default([]);

const stayPricingUnitSchema = z
  .enum(["per_night", "per_person", "per_hour", "per_unit", "per_attraction"])
  .default("per_night");

const tourPricingUnitSchema = z
  .enum(["per_person", "per_hour", "per_unit", "per_attraction", "per_night"])
  .default("per_person");

// PM 2026-06-15: sobreprecio admin reusable. type=null si no aplica; en ese caso
// markup_value se ignora. Para 'percent', value ∈ [-100, 1000]. Para 'amount',
// value es centavos (puede ser negativo para descuentos). Validación cruzada
// type↔value se aplica en cada base schema via .superRefine() — la dejamos
// declarativa acá como shape de campos para poder mergear con z.object().
const markupShape = {
  markup_type: z
    .enum(["percent", "amount"])
    .nullable()
    .optional(),
  markup_value: z.coerce
    .number({ invalid_type_error: "Markup inválido" })
    .nullable()
    .optional(),
};

// Cross-field validation reusable. La invocamos como superRefine en stay/tour.
function validateMarkup(data: { markup_type?: string | null; markup_value?: number | null }, ctx: z.RefinementCtx) {
  const type = data.markup_type ?? null;
  const value = data.markup_value;
  if (type === "percent") {
    if (value == null || Number.isNaN(value)) {
      ctx.addIssue({ code: "custom", path: ["markup_value"], message: "Indicá el porcentaje." });
      return;
    }
    if (value < -100 || value > 1000) {
      ctx.addIssue({ code: "custom", path: ["markup_value"], message: "El porcentaje debe estar entre -100 y 1000." });
    }
  } else if (type === "amount") {
    if (value == null || Number.isNaN(value)) {
      ctx.addIssue({ code: "custom", path: ["markup_value"], message: "Indicá la cantidad (en centavos)." });
    }
  }
}

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
  // Pricing mixto + categoría (PM 2026-06-10).
  pricing_unit: stayPricingUnitSchema,
  pricing_extras: pricingExtrasArraySchema,
  category: optionalText(120, "Categoría"),
  // Políticas editables del stay (PM 2026-06-11): antes hardcoded en JSX.
  check_in_time: optionalText(40, "Hora de entrada"),
  check_out_time: optionalText(40, "Hora de salida"),
  cancellation_policy: optionalText(2000, "Política de cancelación"),
  house_rules: optionalText(2000, "Normas de la casa"),
  // PM 2026-06-15: ver markupShape. La validación cruzada type↔value se aplica
  // a nivel create/update schemas con superRefine — mantener stayBaseSchema
  // como ZodObject permite seguir usándolo con .extend() en updateStaySchema.
  ...markupShape,
}).merge(partnerLinkSchema);

export const createStaySchema = stayBaseSchema.superRefine(validateMarkup);
export const updateStaySchema = stayBaseSchema
  .extend({ id: uuidSchema })
  .superRefine(validateMarkup);
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
  // Pricing mixto + categoría (PM 2026-06-10).
  pricing_unit: tourPricingUnitSchema,
  pricing_extras: pricingExtrasArraySchema,
  category: optionalText(120, "Categoría"),
  // PM 2026-06-15: ver markupShape.
  ...markupShape,
}).merge(partnerLinkSchema);

export const createTourSchema = tourBaseSchema.superRefine(validateMarkup);
export const updateTourSchema = tourBaseSchema
  .extend({ id: uuidSchema })
  .superRefine(validateMarkup);
export const deleteTourSchema = z.object({ id: uuidSchema });

// ─── Catalog: Transfer Routes ───────────────────────────────────────────────

const transferRouteBaseSchema = z.object({
  from_location: optionalNonEmptyText(160, "Origen"),
  to_location: optionalNonEmptyText(160, "Destino"),
  base_price_cents: priceCentsSchema,
  // Default per_unit: precio fijo por viaje (no por pasajero).
  pricing_unit: z.enum(["per_unit", "per_person", "per_hour"]).default("per_unit"),
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
  // Marca de promoción: si true, aparece en "Popular Routes" del público.
  featured: booleanFlagSchema.default(false),
  // PM 2026-06-11: cada ruta-template debe tener un vehículo asignado.
  // Nullable en DB para no romper rutas legacy; el formulario nuevo lo
  // requiere y valida acá si está vacío.
  vehicle_id: uuidSchema.optional().nullable().or(z.literal("")),
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
  // PM 2026-06-17: features + description editables (antes hardcoded en el
  // mapper del frontend, todos los vehículos mostraban lo mismo).
  features: stringArraySchema.default([]),
  description: optionalText(500, "Descripción"),
});

export const createVehicleSchema = vehicleBaseSchema;
export const updateVehicleSchema = vehicleBaseSchema.extend({ id: uuidSchema });
export const deleteVehicleSchema = z.object({ id: uuidSchema });

// ─── Posts (blog) ───────────────────────────────────────────────────────────

export const POST_STATUSES = [
  "draft",
  "scheduled",
  "published",
  "archived",
] as const;
export type PostStatusLiteral = (typeof POST_STATUSES)[number];

const postBaseSchema = z.object({
  slug: slugSchema,
  title_es: optionalNonEmptyText(200, "Título (ES)"),
  title_en: optionalText(200, "Título (EN)"),
  excerpt_es: optionalText(500, "Extracto (ES)"),
  excerpt_en: optionalText(500, "Extracto (EN)"),
  body_es: optionalText(50000, "Cuerpo (ES)"),
  body_en: optionalText(50000, "Cuerpo (EN)"),
  category: optionalText(60, "Categoría"),
  image: optionalText(300, "Imagen"),
  tags: stringArraySchema.default([]),
  featured: booleanFlagSchema.default(false),
  status: z
    .enum(POST_STATUSES, {
      errorMap: () => ({ message: "Estado de publicación inválido" }),
    })
    .default("draft"),
});

export const createPostSchema = postBaseSchema;
export const updatePostSchema = postBaseSchema.extend({ id: uuidSchema });
export const deletePostSchema = z.object({ id: uuidSchema });
export const togglePostPublishSchema = z.object({ id: uuidSchema });
export const togglePostFeaturedSchema = z.object({ id: uuidSchema });

// ─── Drivers (transfers) ────────────────────────────────────────────────────

export const DRIVER_STATUSES = ["available", "in_trip", "off"] as const;
export type DriverStatusLiteral = (typeof DRIVER_STATUSES)[number];

const phoneSchema = z
  .string()
  .trim()
  .max(40, "Teléfono demasiado largo")
  .optional()
  .or(z.literal(""));

const emailSchema = z
  .string()
  .trim()
  .max(200, "Email demasiado largo")
  .email("Email inválido")
  .optional()
  .or(z.literal(""));

const driverBaseSchema = z.object({
  name: optionalNonEmptyText(160, "Nombre"),
  phone: phoneSchema,
  email: emailSchema,
  license: optionalText(60, "Licencia"),
  vehicle: optionalText(200, "Vehículo"),
  emergency_phone: phoneSchema,
  status: z
    .enum(DRIVER_STATUSES, {
      errorMap: () => ({ message: "Estado de chofer inválido" }),
    })
    .default("available"),
  web_visible: booleanFlagSchema.default(false),
});

export const createDriverSchema = driverBaseSchema;
export const updateDriverSchema = driverBaseSchema.extend({ id: uuidSchema });
export const deleteDriverSchema = z.object({ id: uuidSchema });
export const toggleDriverVisibilitySchema = z.object({ id: uuidSchema });

// ─── Coupons ────────────────────────────────────────────────────────────────

const couponCodeSchema = z
  .string({ required_error: "Código requerido" })
  .trim()
  .min(2, "Código demasiado corto")
  .max(40, "Código demasiado largo")
  .regex(/^[A-Z0-9_-]+$/i, "Solo letras, números, guion y guion bajo");

const discountPctSchema = z.coerce
  .number({ invalid_type_error: "Descuento inválido" })
  .int("El descuento debe ser entero")
  .min(0, "El descuento no puede ser negativo")
  .max(100, "El descuento no puede exceder 100");

const maxUsesSchema = z.coerce
  .number({ invalid_type_error: "Máx. usos inválido" })
  .int("Máx. usos debe ser entero")
  .min(0, "Máx. usos no puede ser negativo")
  .max(1_000_000, "Máx. usos fuera de rango")
  .optional()
  .nullable();

const expiresAtSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de expiración inválida (YYYY-MM-DD)")
  .optional()
  .or(z.literal(""));

const couponBaseSchema = z.object({
  code: couponCodeSchema,
  description_es: optionalText(500, "Descripción (ES)"),
  description_en: optionalText(500, "Descripción (EN)"),
  discount_pct: discountPctSchema,
  max_uses: maxUsesSchema,
  expires_at: expiresAtSchema,
  active: booleanFlagSchema.default(true),
});

export const createCouponSchema = couponBaseSchema;
export const updateCouponSchema = couponBaseSchema.extend({ id: uuidSchema });
export const deleteCouponSchema = z.object({ id: uuidSchema });
export const toggleCouponActiveSchema = z.object({ id: uuidSchema });

// ─── Users ──────────────────────────────────────────────────────────────────

export const USER_ROLES = ["admin", "user"] as const;
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

// ─── Partners (páginas aliadas) ─────────────────────────────────────────────

const partnerBaseSchema = z.object({
  name: optionalNonEmptyText(160, "Nombre"),
  slug: slugSchema,
  base_url: z
    .string({ required_error: "URL base requerida" })
    .trim()
    .min(1, "URL base requerida")
    .max(500, "URL demasiado larga")
    .regex(/^https?:\/\//i, "Debe iniciar con http:// o https://"),
  logo: optionalText(2000, "Logo URL"),
  contact_email: z
    .string()
    .trim()
    .max(200, "Email demasiado largo")
    .optional()
    .or(z.literal("")),
  contact_phone: optionalText(50, "Teléfono"),
  notes_es: optionalText(2000, "Notas (ES)"),
  notes_en: optionalText(2000, "Notas (EN)"),
  utm_source: optionalText(80, "UTM source").transform((v) =>
    v && v.length > 0 ? v : "prdise"
  ),
  affiliate_code: optionalText(120, "Código afiliado"),
  active: booleanFlagSchema.default(true),
});

export const createPartnerSchema = partnerBaseSchema;
export const updatePartnerSchema = partnerBaseSchema.extend({ id: uuidSchema });
export const deletePartnerSchema = z.object({ id: uuidSchema });

export const logReferralSchema = z.object({
  partner_id: uuidSchema,
  item_type: z.enum(ITEM_TYPES),
  item_id: uuidSchema,
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
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type CreateDriverInput = z.infer<typeof createDriverSchema>;
export type UpdateDriverInput = z.infer<typeof updateDriverSchema>;
export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
export type CreatePartnerInput = z.infer<typeof createPartnerSchema>;
export type UpdatePartnerInput = z.infer<typeof updatePartnerSchema>;
export type LogReferralInput = z.infer<typeof logReferralSchema>;
