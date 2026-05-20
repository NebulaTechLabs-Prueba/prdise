/**
 * Configuración bilingüe del programa de lealtad de prdise.
 *
 * Reglas de negocio (ver project_business_rules.md):
 * - 100 pts por cada USD gastado en un booking completado (trigger DB
 *   `tg_award_points_on_booking_completed` lo aplica).
 * - Tiers: bronze (default), silver y gold.
 * - El descuento se aplica en checkout (no implementado en este file; aquí
 *   solo se declara para que la UI lo muestre).
 *
 * Los thresholds viven SOLO acá. Cualquier lógica que necesite saber
 * "¿qué tier corresponde a X puntos?" debe llamar a `tierForPoints()` o
 * `nextTierProgress()`. No duplicar números.
 */

export type LoyaltyTierKey = "bronze" | "silver" | "gold";

export interface LoyaltyTierLabel {
  es: string;
  en: string;
}

export interface LoyaltyTier {
  key: LoyaltyTierKey;
  /** Puntos mínimos para entrar en este tier (inclusivo). */
  minPoints: number;
  /** Porcentaje de descuento en checkout (0–100). */
  discount: number;
  label: LoyaltyTierLabel;
}

/**
 * Tabla de tiers ordenada por `minPoints` ascendente.
 * Si se agrega un tier nuevo (ej. platinum), insertarlo respetando el orden.
 */
export const LOYALTY_TIERS: readonly LoyaltyTier[] = [
  {
    key: "bronze",
    minPoints: 0,
    discount: 0,
    label: { es: "Bronce", en: "Bronze" },
  },
  {
    key: "silver",
    minPoints: 500,
    discount: 5,
    label: { es: "Plata", en: "Silver" },
  },
  {
    key: "gold",
    minPoints: 2000,
    discount: 10,
    label: { es: "Oro", en: "Gold" },
  },
] as const;

/**
 * Retorna el tier al que pertenece `points` (el de mayor `minPoints` ≤ points).
 * Para puntos negativos o no numéricos devuelve el tier base (bronze).
 */
export function tierForPoints(points: number): LoyaltyTier {
  const safe =
    Number.isFinite(points) && points > 0 ? Math.floor(points) : 0;

  // LOYALTY_TIERS está ordenado ascendentemente; recorremos al revés para
  // tomar el primero cuyo umbral entre.
  for (let i = LOYALTY_TIERS.length - 1; i >= 0; i--) {
    const tier = LOYALTY_TIERS[i];
    if (safe >= tier.minPoints) {
      return tier;
    }
  }

  // Defensivo: LOYALTY_TIERS siempre arranca en 0, así que esto no debería
  // alcanzarse. Devolvemos el primero igual.
  return LOYALTY_TIERS[0];
}

export interface NextTierProgress {
  currentTier: LoyaltyTier;
  /** `null` si ya está en el tier máximo. */
  nextTier: LoyaltyTier | null;
  /** Puntos faltantes para entrar al siguiente tier. 0 si está en el máximo. */
  pointsToNextTier: number;
  /**
   * Porcentaje de progreso dentro del tier actual hacia el siguiente
   * (0–100, redondeado). 100 si está en el tier máximo.
   */
  progressPct: number;
}

/**
 * Calcula la progresión del usuario dentro del programa de lealtad.
 * Útil para barras de progreso, banners "te faltan X puntos para Y", etc.
 */
export function nextTierProgress(points: number): NextTierProgress {
  const safe =
    Number.isFinite(points) && points > 0 ? Math.floor(points) : 0;

  const currentTier = tierForPoints(safe);
  const currentIndex = LOYALTY_TIERS.findIndex((t) => t.key === currentTier.key);
  const nextTier =
    currentIndex >= 0 && currentIndex < LOYALTY_TIERS.length - 1
      ? LOYALTY_TIERS[currentIndex + 1]
      : null;

  if (!nextTier) {
    return {
      currentTier,
      nextTier: null,
      pointsToNextTier: 0,
      progressPct: 100,
    };
  }

  const pointsToNextTier = Math.max(0, nextTier.minPoints - safe);

  const tierRange = nextTier.minPoints - currentTier.minPoints;
  const progressInTier = safe - currentTier.minPoints;
  const progressPct =
    tierRange > 0
      ? Math.min(100, Math.max(0, Math.round((progressInTier / tierRange) * 100)))
      : 0;

  return {
    currentTier,
    nextTier,
    pointsToNextTier,
    progressPct,
  };
}
