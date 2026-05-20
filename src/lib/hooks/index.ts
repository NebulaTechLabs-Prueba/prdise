/**
 * Barrel de hooks Supabase para el JSX cliente (PrdiseApp.jsx y otros
 * componentes "use client").
 *
 * Convención de uso desde el JSX:
 *   import { useMyBookings, useMyCart } from "@/lib/hooks";
 *   const { data, loading, error, refetch } = useMyBookings();
 *
 * Reglas:
 *   - Todos los hooks asumen Client Component (cada archivo trae su propia
 *     directiva `"use client"`).
 *   - El estado de retorno siempre es `{ data, loading, error, refetch }`
 *     — ver `useSupabaseQuery` para el contrato exacto.
 *   - Para mutaciones (addToCart, confirmPayment, etc.) seguimos importando
 *     las Server Actions directamente desde sus módulos; estos hooks son
 *     SOLO para lectura.
 */

export {
  useSupabaseQuery,
  type UseSupabaseQueryResult,
} from "./useSupabaseQuery";

export { useMyBookings, type BookingView } from "./useMyBookings";
export { useMyCart, type CartItemView } from "./useMyCart";
export { useMyProfile, type MyProfile } from "./useMyProfile";
export { useMyLoyalty, type MyLoyalty } from "./useMyLoyalty";

export {
  useAdminPendingPayments,
  type PendingPaymentRow,
} from "./useAdminPendingPayments";
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
