/**
 * Barrel de hooks Supabase para el JSX cliente (PrdiseApp.jsx y otros
 * componentes "use client").
 *
 * Convención de uso desde el JSX:
 *   import { useCatalog, useAdminBookings } from "@/lib/hooks";
 *   const { data, loading, error, refetch } = useCatalog();
 *
 * Reglas:
 *   - Todos los hooks asumen Client Component (cada archivo trae su propia
 *     directiva `"use client"`).
 *   - El estado de retorno siempre es `{ data, loading, error, refetch }`
 *     — ver `useSupabaseQuery` para el contrato exacto.
 *   - Para mutaciones (markInvoicePaid, updateBookingStatus, etc.) seguimos
 *     importando las Server Actions directamente desde sus módulos; estos
 *     hooks son SOLO para lectura.
 *
 * Pivote 2026-06-04: se eliminaron hooks de cart/bookings/pendingPayments
 * porque PRDISE pasa a modelo catálogo + referral (sin checkout, sin pagos
 * in-app). Loyalty queda dormido pero el hook sigue por si lo retomamos.
 */

export {
  useSupabaseQuery,
  type UseSupabaseQueryResult,
} from "./useSupabaseQuery";

export { useMyProfile, type MyProfile } from "./useMyProfile";
export { useMyLoyalty, type MyLoyalty } from "./useMyLoyalty";

export {
  useAdminBookings,
  type ListBookingsOpts,
  type ListBookingsResult,
} from "./useAdminBookings";
export {
  useAdminUsers,
  type ListUsersOpts,
  type ListUsersResult,
} from "./useAdminUsers";

export {
  useCatalog,
  type UseCatalogResult,
  type UseCatalogOpts,
  type StayRow,
  type TourRow,
  type TransferRouteRow,
  type VehicleRow,
} from "./useCatalog";
