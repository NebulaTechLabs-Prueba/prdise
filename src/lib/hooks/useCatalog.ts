"use client";

/**
 * Hook agregador del catálogo público: stays, tours, transfer routes y
 * vehicles. Pensado para que el panel admin recargue todo tras un CRUD sin
 * tener que invocar 4 hooks distintos en cascada.
 *
 * Cada query usa el browser client de Supabase (`@/lib/supabase/client`) y
 * respeta RLS — los anónimos solo verán `active=true`.
 *
 * Devuelve `null` en cada slot hasta que la carga inicial termine. Después
 * del primer fetch, los datos quedan tipados a su tabla correspondiente.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  getStays,
  getTours,
  getTransferRoutes,
  getVehicles,
} from "@/lib/queries/catalog";
import type { Tables } from "@/lib/supabase/database.types";

export type StayRow = Tables<"stays">;
export type TourRow = Tables<"tours">;
export type TransferRouteRow = Tables<"transfer_routes">;
export type VehicleRow = Tables<"vehicles">;

export interface UseCatalogResult {
  stays: StayRow[] | null;
  tours: TourRow[] | null;
  transferRoutes: TransferRouteRow[] | null;
  vehicles: VehicleRow[] | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export interface UseCatalogOpts {
  /**
   * Si `true`, sólo trae registros con `active=true`. Útil para vistas
   * públicas. Para el panel admin pasar `false` para ver inactivos. Default `true`.
   */
  activeOnly?: boolean;
}

export function useCatalog(opts: UseCatalogOpts = {}): UseCatalogResult {
  const { activeOnly = true } = opts;

  const supabase = useMemo(() => createClient(), []);

  const [stays, setStays] = useState<StayRow[] | null>(null);
  const [tours, setTours] = useState<TourRow[] | null>(null);
  const [transferRoutes, setTransferRoutes] = useState<
    TransferRouteRow[] | null
  >(null);
  const [vehicles, setVehicles] = useState<VehicleRow[] | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [reloadToken, setReloadToken] = useState(0);
  const refetch = useCallback(() => {
    setReloadToken((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    setLoading(true);
    setError(null);

    Promise.all([
      getStays(supabase, { activeOnly }),
      getTours(supabase, { activeOnly }),
      getTransferRoutes(supabase, { activeOnly }),
      getVehicles(supabase, { activeOnly }),
    ])
      .then(([s, t, tr, v]) => {
        if (cancelled) return;
        setStays(s);
        setTours(t);
        setTransferRoutes(tr);
        setVehicles(v);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "No se pudo cargar el catálogo";
        setError(message);
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [supabase, activeOnly, reloadToken]);

  return {
    stays,
    tours,
    transferRoutes,
    vehicles,
    loading,
    error,
    refetch,
  };
}
