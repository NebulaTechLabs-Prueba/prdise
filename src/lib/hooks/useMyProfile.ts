"use client";

/**
 * Hook para leer el perfil completo del usuario actual.
 *
 * NOTA arquitectural: `getMyProfile()` vive en `@/lib/profile/queries.ts`
 * (sin directiva `"use server"`) y depende de `@/lib/supabase/server`, así
 * que NO se puede importar desde Client Components — rompería el build.
 *
 * Para evitar esa dependencia y mantener al JSX cliente puro, replicamos
 * la query con el browser client (`@/lib/supabase/client`). El tipo
 * `MyProfile` se reexporta de `@/lib/profile/queries` para mantener una
 * sola fuente de verdad sobre la forma del objeto.
 */

import { useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import type { MyProfile } from "@/lib/profile/queries";
import {
  useSupabaseQuery,
  type UseSupabaseQueryResult,
} from "./useSupabaseQuery";

export type { MyProfile };

async function fetchMyProfile(
  supabase: ReturnType<typeof createClient>
): Promise<MyProfile | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) return null;

  return {
    ...profile,
    email: user.email ?? null,
  };
}

export function useMyProfile(): UseSupabaseQueryResult<MyProfile | null> {
  // Memoizamos el cliente para que su identidad sea estable entre renders.
  const supabase = useMemo(() => createClient(), []);
  return useSupabaseQuery<MyProfile | null>(() => fetchMyProfile(supabase), []);
}
