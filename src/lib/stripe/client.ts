import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * PM 2026-06-29: Stripe lee primero la tabla `payment_provider_configs`
 * (admin la edita desde Configuración → Integraciones) y solo cae al
 * env var STRIPE_SECRET_KEY si la DB no tiene una key habilitada. Antes
 * solo leía env, lo que obligaba a setear GitHub Secrets + re-deploy
 * cada vez que el cliente quería cambiar las keys. Ahora el cambio es
 * inmediato desde el admin UI — sin SSH, sin re-deploy.
 *
 * Cache de 60s para evitar martillar Supabase en cada request.
 */
let _stripe: Stripe | null = null;
let _stripeKeyCache: { key: string | null; expiresAt: number } | null = null;
const KEY_CACHE_MS = 60_000;

async function resolveStripeKey(): Promise<string | null> {
  const now = Date.now();
  if (_stripeKeyCache && _stripeKeyCache.expiresAt > now) {
    return _stripeKeyCache.key;
  }
  let key: string | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("payment_provider_configs")
      .select("secret_key, enabled")
      .eq("provider", "stripe")
      .maybeSingle();
    if (data?.enabled && data.secret_key && data.secret_key.trim()) {
      key = data.secret_key.trim();
    }
  } catch {
    // best-effort: si la query falla, fallback al env.
  }
  if (!key) key = process.env.STRIPE_SECRET_KEY || null;
  _stripeKeyCache = { key, expiresAt: now + KEY_CACHE_MS };
  return key;
}

export async function getStripe(): Promise<Stripe> {
  const key = await resolveStripeKey();
  if (!key) {
    throw new Error(
      "Stripe no está configurado. Andá a Admin → Configuración → Integraciones y guardá las claves, o agregá STRIPE_SECRET_KEY al .env del server."
    );
  }
  // Re-instanciar si la key cambió (cliente la rotó desde el admin).
  if (!_stripe || (_stripe as Stripe & { __key?: string }).__key !== key) {
    _stripe = new Stripe(key, { typescript: true });
    (_stripe as Stripe & { __key?: string }).__key = key;
  }
  return _stripe;
}

export async function isStripeConfigured(): Promise<boolean> {
  const key = await resolveStripeKey();
  return Boolean(key);
}

/**
 * PM 2026-06-29: webhook secret — mismo patrón. Lee primero la tabla
 * `payment_provider_configs.webhook_secret`, fallback a env var
 * STRIPE_WEBHOOK_SECRET. El handler de /api/stripe/webhook valida la
 * firma con este secret.
 */
let _stripeWebhookSecretCache: { secret: string | null; expiresAt: number } | null = null;

/**
 * PM 2026-06-29: el admin acaba de guardar nuevas keys desde el panel.
 * Invalidamos los caches para que la próxima request use los valores
 * frescos sin esperar el TTL de 60s.
 */
export function invalidateStripeCache(): void {
  _stripeKeyCache = null;
  _stripeWebhookSecretCache = null;
  _stripe = null;
}

export async function getStripeWebhookSecret(): Promise<string | null> {
  const now = Date.now();
  if (_stripeWebhookSecretCache && _stripeWebhookSecretCache.expiresAt > now) {
    return _stripeWebhookSecretCache.secret;
  }
  let secret: string | null = null;
  try {
    const admin = createAdminClient();
    const { data } = await admin
      .from("payment_provider_configs")
      .select("webhook_secret, enabled")
      .eq("provider", "stripe")
      .maybeSingle();
    if (data?.enabled && data.webhook_secret && data.webhook_secret.trim()) {
      secret = data.webhook_secret.trim();
    }
  } catch {
    // best-effort: fallback al env.
  }
  if (!secret) secret = process.env.STRIPE_WEBHOOK_SECRET || null;
  _stripeWebhookSecretCache = { secret, expiresAt: now + KEY_CACHE_MS };
  return secret;
}
