/**
 * Queries server-side para la vista "Mi cuenta" (perfil, bookings, loyalty).
 *
 * Todas las funciones leen el usuario actual de la sesión via
 * `supabase.auth.getUser()` y delegan en RLS para el filtrado de datos. Si no
 * hay sesión activa, retornan `null` para que la página decida si redirige.
 */
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/lib/supabase/database.types";
import {
  nextTierProgress,
  type LoyaltyTierKey,
} from "@/lib/loyalty/config";

export type ProfileRow = Tables<"profiles">;
export type BookingRow = Tables<"bookings">;
export type PaymentRow = Tables<"payments">;

export interface MyProfile extends ProfileRow {
  email: string | null;
}

export interface MyBooking extends BookingRow {
  payments: PaymentRow[];
}

export interface MyLoyalty {
  points_balance: number;
  points_spent: number;
  tier: LoyaltyTierKey;
  /** Key del siguiente tier o `null` si está en el máximo. */
  nextTier: Exclude<LoyaltyTierKey, "bronze"> | null;
  pointsToNextTier: number;
}

/**
 * Retorna el perfil completo del usuario actual + email de `auth.users`.
 * `null` si no hay sesión o el perfil no existe.
 */
export async function getMyProfile(): Promise<MyProfile | null> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return null;
  }

  return {
    ...profile,
    email: user.email ?? null,
  };
}

/**
 * Retorna los bookings del usuario actual con sus payments anidados,
 * ordenados por `created_at` desc. Arreglo vacío si no hay sesión.
 *
 * RLS sobre `bookings` y `payments` ya restringe al usuario; no hace falta
 * filtrar por `user_id` explícito, pero lo hacemos por claridad/defensiva.
 */
export async function getMyBookings(): Promise<MyBooking[]> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return [];
  }

  const { data, error } = await supabase
    .from("bookings")
    .select("*, payments(*)")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error || !data) {
    return [];
  }

  return data as MyBooking[];
}

/**
 * Retorna el resumen de lealtad del usuario actual.
 * Los thresholds y el siguiente tier se calculan vía `nextTierProgress()`
 * para no duplicar la tabla `LOYALTY_TIERS`.
 *
 * Si no hay sesión o no se encuentra el perfil, retorna defaults bronze.
 */
export async function getMyLoyalty(): Promise<MyLoyalty> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const fallback: MyLoyalty = {
    points_balance: 0,
    points_spent: 0,
    tier: "bronze",
    nextTier: "silver",
    pointsToNextTier: 500,
  };

  if (!user) {
    return fallback;
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("points_balance, points_spent, tier")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    return fallback;
  }

  const progress = nextTierProgress(profile.points_balance);

  return {
    points_balance: profile.points_balance,
    points_spent: profile.points_spent,
    tier: profile.tier,
    nextTier:
      progress.nextTier
        ? (progress.nextTier.key as Exclude<LoyaltyTierKey, "bronze">)
        : null,
    pointsToNextTier: progress.pointsToNextTier,
  };
}
