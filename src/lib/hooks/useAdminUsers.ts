"use client";

/**
 * Hook para listar TODOS los usuarios (panel admin) con filtros + paginación.
 *
 * Acepta `ListUsersOpts` (`{ page, pageSize, role, status, search }`) y los
 * usa como dependencias del fetch.
 */

import { useMemo } from "react";
import { listAllUsers } from "@/lib/admin/users";
import type { ListUsersResult } from "@/lib/admin/types";
import type { ListUsersOpts } from "@/lib/admin/schemas";
import {
  useSupabaseQuery,
  type UseSupabaseQueryResult,
} from "./useSupabaseQuery";

export type { ListUsersOpts, ListUsersResult };

export function useAdminUsers(
  opts: ListUsersOpts = {}
): UseSupabaseQueryResult<ListUsersResult> {
  const depKey = useMemo(() => JSON.stringify(opts ?? {}), [opts]);

  const loadAdminUsers = async (): Promise<ListUsersResult> => {
    const result = await listAllUsers(opts);
    if (!result.ok) {
      throw new Error(result.error);
    }
    return result.data;
  };

  return useSupabaseQuery<ListUsersResult>(loadAdminUsers, [depKey]);
}
