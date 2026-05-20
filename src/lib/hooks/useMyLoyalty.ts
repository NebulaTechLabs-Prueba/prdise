"use client";

/**
 * Hook para leer el resumen de lealtad del usuario actual
 * (points_balance, tier, próximo tier, etc.).
 *
 * Misma situación que `useMyProfile`: la función `getMyLoyalty()` de
 * `@/lib/profile/queries.ts` usa el server client de Supabase y no se puede
 * invocar desde Client Components. Replicamos la query con el browser
 * client, pero el cálculo de `nextTier`/`pointsToNextTier` lo delegamos al
 * helper puro `nextTierProgress()` para no duplicar la tabla de tiers.
 */

import { useMemo } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  nextTierProgress,
  type LoyaltyTierKey,
} from "@/lib/loyalty/config";
import type { MyLoyalty } from "@/lib/profile/queries";
import {
  useSupabaseQuery,
  type UseSupabaseQueryResult,
} from "./useSupabaseQuery";

export type { MyLoyalty };

const FALLBACK: MyLoyalty = {
  points_balance: 0,
  points_spent: 0,
  tier: "bronze",
  nextTier: "silver",
  pointsToNextTier: 500,
};

async function fetchMyLoyalty(
  supabase: ReturnType<typeof createClient>
): Promise<MyLoyalty> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return FALLBACK;

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("points_balance, points_spent, tier")
    .eq("id", user.id)
    .single();

  if (error || !profile) return FALLBACK;

  const progress = nextTierProgress(profile.points_balance);

  return {
    points_balance: profile.points_balance,
    points_spent: profile.points_spent,
    tier: profile.tier,
    nextTier: progress.nextTier
      ? (progress.nextTier.key as Exclude<LoyaltyTierKey, "bronze">)
      : null,
    pointsToNextTier: progress.pointsToNextTier,
  };
}

export function useMyLoyalty(): UseSupabaseQueryResult<MyLoyalty> {
  const supabase = useMemo(() => createClient(), []);
  return useSupabaseQuery<MyLoyalty>(() => fetchMyLoyalty(supabase), []);
}
