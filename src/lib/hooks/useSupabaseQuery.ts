"use client";

/**
 * Hook genérico para queries contra Supabase desde Client Components.
 *
 * Estandariza el patrón `{ data, loading, error, refetch }` que el JSX
 * monolítico (PrdiseApp.jsx) consume, sin tener que escribir
 * `useState/useEffect` manual en cada lugar.
 *
 * Convención:
 *   - `queryFn` retorna directamente los datos. Si tu Server Action devuelve
 *     `{ ok: true, data }` o `{ ok: false, error }`, mapealo antes en un
 *     wrapper (ej. lanzando para que el catch lo capture).
 *   - `loading = true` durante el primer fetch y durante cualquier refetch.
 *   - `error` es siempre string en español (ya pre-mapeado) o `null`.
 *   - `refetch()` reinicia loading y vuelve a llamar `queryFn`.
 *
 * No usa React Query / SWR a propósito: dependencia cero más allá de React,
 * para mantener el bundle del JSX cliente liviano.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface UseSupabaseQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useSupabaseQuery<T>(
  queryFn: () => Promise<T>,
  deps: unknown[] = []
): UseSupabaseQueryResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Token para evitar setState con resultados de fetches "viejos" cuando los
  // deps cambiaron mientras la promesa anterior aún resolvía.
  const callIdRef = useRef(0);
  // Mantenemos `queryFn` en una ref para no re-disparar el efecto cuando la
  // función cambie de identidad (el control de re-ejecución es `deps`).
  const queryFnRef = useRef(queryFn);
  queryFnRef.current = queryFn;

  const run = useCallback(() => {
    const currentCall = ++callIdRef.current;
    setLoading(true);
    setError(null);

    queryFnRef
      .current()
      .then((result) => {
        if (currentCall !== callIdRef.current) return;
        setData(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (currentCall !== callIdRef.current) return;
        const message =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Error inesperado";
        setError(message);
        setLoading(false);
      });
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    run();
    // Limpieza: invalidamos cualquier fetch en vuelo al desmontar/cambiar deps.
    return () => {
      callIdRef.current++;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading, error, refetch: run };
}
