/**
 * Tipos y constantes de permisos granulares.
 *
 * IMPORTANTE: la lista de `PermissionKey` debe estar sincronizada con el seed
 * de `supabase/migrations/20260520120000_granular_permissions.sql`. Si añades
 * una key acá, añadila también en la migración (y viceversa).
 */

export const PERMISSION_AREAS = [
  "stays",
  "tours",
  "transfers",
  "payments",
  "bookings",
  "users",
  "posts",
  "reviews",
  "settings",
  "partners",
  "invoices",
] as const;

export type PermissionArea = (typeof PERMISSION_AREAS)[number];

export type PermissionKey =
  | "stays:read"
  | "stays:write"
  | "stays:delete"
  | "tours:read"
  | "tours:write"
  | "tours:delete"
  | "transfers:read"
  | "transfers:write"
  | "transfers:delete"
  | "payments:read"
  | "payments:confirm"
  | "payments:reject"
  | "bookings:read"
  | "bookings:update"
  | "users:read"
  | "users:edit_role"
  | "posts:read"
  | "posts:write"
  | "posts:publish"
  | "reviews:read"
  | "reviews:approve"
  | "settings:read"
  | "settings:write"
  | "partners:read"
  | "partners:write"
  | "partners:delete"
  | "referrals:read"
  | "invoices:read"
  | "invoices:write";

/**
 * Lista runtime de TODAS las keys conocidas. Útil para validar input
 * desde formularios antes de tocar la DB.
 */
export const ALL_PERMISSION_KEYS: readonly PermissionKey[] = [
  "stays:read",
  "stays:write",
  "stays:delete",
  "tours:read",
  "tours:write",
  "tours:delete",
  "transfers:read",
  "transfers:write",
  "transfers:delete",
  "payments:read",
  "payments:confirm",
  "payments:reject",
  "bookings:read",
  "bookings:update",
  "users:read",
  "users:edit_role",
  "posts:read",
  "posts:write",
  "posts:publish",
  "reviews:read",
  "reviews:approve",
  "settings:read",
  "settings:write",
  "partners:read",
  "partners:write",
  "partners:delete",
  "referrals:read",
  "invoices:read",
  "invoices:write",
] as const;

/**
 * Texto exacto que el admin debe tipear en el modal para revocar un permiso.
 */
export const REVOKE_CONFIRMATION_PHRASE = "Confirmo revocar este permiso";

export function isPermissionKey(value: unknown): value is PermissionKey {
  return (
    typeof value === "string" &&
    (ALL_PERMISSION_KEYS as readonly string[]).includes(value)
  );
}
