"use client";

/**
 * Hook para listar las reservas del usuario logueado.
 *
 * Envuelve `listMyBookings()` de `@/lib/bookings/actions`, que es invocable
 * desde Client Components porque el módulo es `"use server"` (Next la expone
 * automáticamente como Server Action via fetch interno).
 */

import { listMyBookings, type BookingView } from "@/lib/bookings/actions";
import {
  useSupabaseQuery,
  type UseSupabaseQueryResult,
} from "./useSupabaseQuery";

export type { BookingView };

export function useMyBookings(): UseSupabaseQueryResult<BookingView[]> {
  return useSupabaseQuery<BookingView[]>(() => listMyBookings(), []);
}
