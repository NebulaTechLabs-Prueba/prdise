"use client";

/**
 * Hook para listar TODAS las reservas (panel admin) con filtros + paginación.
 *
 * Acepta `ListBookingsOpts` (`{ page, pageSize, status, itemType, dateFrom,
 * dateTo }`) y los usa como dependencias del fetch, de modo que cualquier
 * cambio en los filtros gatilla refetch automático.
 *
 * Las claves del opts se serializan a JSON para la dep array — así un objeto
 * literal recreado en cada render no causa refetch si su contenido es igual.
 */

import { useMemo } from "react";
import { listAllBookings } from "@/lib/admin/bookings";
import type { ListBookingsResult } from "@/lib/admin/types";
import type { ListBookingsOpts } from "@/lib/admin/schemas";
import {
  useSupabaseQuery,
  type UseSupabaseQueryResult,
} from "./useSupabaseQuery";

export type { ListBookingsOpts, ListBookingsResult };

export function useAdminBookings(
  opts: ListBookingsOpts = {}
): UseSupabaseQueryResult<ListBookingsResult> {
  // Estabilizamos las deps por contenido para no refetchear ante un objeto
  // recreado idéntico.
  const depKey = useMemo(() => JSON.stringify(opts ?? {}), [opts]);

  const loadAdminBookings = async (): Promise<ListBookingsResult> => {
    const result = await listAllBookings(opts);
    if (!result.ok) {
      throw new Error(result.error);
    }
    return result.data;
  };

  return useSupabaseQuery<ListBookingsResult>(loadAdminBookings, [depKey]);
}
