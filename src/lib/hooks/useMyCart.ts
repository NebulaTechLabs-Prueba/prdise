"use client";

/**
 * Hook para listar los ítems del carrito del usuario logueado.
 *
 * Envuelve `listCart()` de `@/lib/cart/actions` (módulo `"use server"`).
 * Retorna `[]` si no hay sesión.
 */

import { listCart, type CartItemView } from "@/lib/cart/actions";
import {
  useSupabaseQuery,
  type UseSupabaseQueryResult,
} from "./useSupabaseQuery";

export type { CartItemView };

export function useMyCart(): UseSupabaseQueryResult<CartItemView[]> {
  return useSupabaseQuery<CartItemView[]>(() => listCart(), []);
}
