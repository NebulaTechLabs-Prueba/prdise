"use client";

/**
 * Hook para listar payments en estado 'claimed' (pendientes de validación)
 * desde el panel admin.
 *
 * `listPendingPayments()` retorna `ActionResult<PendingPaymentRow[]>`, así
 * que desempaquetamos: si `ok=false`, lanzamos para que el hook lo capture
 * en `error`. Si `ok=true`, devolvemos `data`.
 */

import { listPendingPayments } from "@/lib/admin/payments";
import type { PendingPaymentRow } from "@/lib/admin/types";
import {
  useSupabaseQuery,
  type UseSupabaseQueryResult,
} from "./useSupabaseQuery";

export type { PendingPaymentRow };

async function loadPendingPayments(): Promise<PendingPaymentRow[]> {
  const result = await listPendingPayments();
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.data;
}

export function useAdminPendingPayments(): UseSupabaseQueryResult<
  PendingPaymentRow[]
> {
  return useSupabaseQuery<PendingPaymentRow[]>(loadPendingPayments, []);
}
