/**
 * Cliente REST para PayPal (Orders API v2 + Webhook signature verify).
 *
 * Sin SDK — fetch directo. Razones: menos deps, menos churn al actualizar,
 * y el surface usado (auth → create order → fetch order → verify webhook)
 * es chico y estable.
 *
 * Configuración requerida en `.env`:
 *   - PAYPAL_ENV          'sandbox' | 'live'  (default 'sandbox')
 *   - PAYPAL_CLIENT_ID    Credenciales de la app de PayPal Developer.
 *   - PAYPAL_SECRET       Idem.
 *   - PAYPAL_WEBHOOK_ID   ID del webhook configurado en PayPal Dashboard;
 *                         requerido solo en la ruta del webhook.
 */

export type PayPalEnv = "sandbox" | "live";

export type PayPalConfig = {
  env: PayPalEnv;
  base: string;
  clientId: string;
  secret: string;
};

/**
 * PM 2026-06-29: lee primero tabla `payment_provider_configs` (admin la
 * edita desde Configuración → Integraciones), fallback a env vars. Cache
 * de 60s para no martillar Supabase.
 */
let _paypalCfgCache: { cfg: PayPalConfig | null; expiresAt: number } | null = null;
const PAYPAL_CACHE_MS = 60_000;

export async function getPayPalConfig(): Promise<PayPalConfig | null> {
  const now = Date.now();
  if (_paypalCfgCache && _paypalCfgCache.expiresAt > now) {
    return _paypalCfgCache.cfg;
  }
  let cfg: PayPalConfig | null = null;
  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data } = await admin
      .from("payment_provider_configs")
      .select("client_id, client_secret, mode, enabled")
      .eq("provider", "paypal")
      .maybeSingle();
    if (data?.enabled && data.client_id && data.client_secret) {
      const env: PayPalEnv = data.mode === "live" ? "live" : "sandbox";
      cfg = {
        env,
        base: env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com",
        clientId: data.client_id,
        secret: data.client_secret,
      };
    }
  } catch {
    // best-effort: si falla, fallback a env.
  }
  if (!cfg) {
    const env = (process.env.PAYPAL_ENV ?? "sandbox") as PayPalEnv;
    const clientId = process.env.PAYPAL_CLIENT_ID;
    const secret = process.env.PAYPAL_SECRET;
    if (clientId && secret) {
      cfg = {
        env,
        base: env === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com",
        clientId,
        secret,
      };
    }
  }
  _paypalCfgCache = { cfg, expiresAt: now + PAYPAL_CACHE_MS };
  return cfg;
}

export async function isPayPalConfigured(): Promise<boolean> {
  return (await getPayPalConfig()) !== null;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

async function getAccessToken(cfg: PayPalConfig): Promise<string> {
  const auth = Buffer.from(`${cfg.clientId}:${cfg.secret}`).toString("base64");
  const res = await fetch(`${cfg.base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
    cache: "no-store",
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`PayPal auth ${res.status}: ${txt.slice(0, 200)}`);
  }
  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new Error("PayPal auth devolvió respuesta sin access_token");
  return data.access_token;
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export type CreateOrderParams = {
  cfg: PayPalConfig;
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  totalCents: number;
  returnUrl: string;
  cancelUrl: string;
};

export type CreatedOrder = {
  orderId: string;
  approveUrl: string;
};

/**
 * Crea un Order con intent=CAPTURE: cuando el cliente apruebe en la URL
 * `approve`, PayPal captura automáticamente el pago y dispara
 * PAYMENT.CAPTURE.COMPLETED al webhook.
 */
export async function createCheckoutOrder(params: CreateOrderParams): Promise<CreatedOrder> {
  const token = await getAccessToken(params.cfg);
  const amount = (params.totalCents / 100).toFixed(2);
  const description = `Factura ${params.invoiceNumber} — ${params.customerName}`.slice(0, 127);

  const res = await fetch(`${params.cfg.base}/v2/checkout/orders`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: params.invoiceId,
          description,
          custom_id: params.invoiceId, // viene en el webhook → resolve directo
          invoice_id: params.invoiceNumber,
          amount: {
            currency_code: "USD",
            value: amount,
          },
        },
      ],
      application_context: {
        brand_name: "Living In Prdise",
        user_action: "PAY_NOW",
        shipping_preference: "NO_SHIPPING",
        return_url: params.returnUrl,
        cancel_url: params.cancelUrl,
      },
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`PayPal createOrder ${res.status}: ${txt.slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    id: string;
    links: Array<{ rel: string; href: string; method: string }>;
  };
  const approve = data.links.find((l) => l.rel === "approve")?.href;
  if (!approve) throw new Error("PayPal createOrder respuesta sin link approve");
  return { orderId: data.id, approveUrl: approve };
}

// ─── Webhook signature verification ──────────────────────────────────────────

export type VerifyWebhookParams = {
  cfg: PayPalConfig;
  webhookId: string;
  headers: Record<string, string>; // keys en lowercase
  body: unknown; // el webhook_event PARSEADO (JSON object)
};

/**
 * Verifica que la notificación venga genuinamente de PayPal usando el
 * endpoint `verify-webhook-signature`. Si cualquier paso falla (auth, headers
 * faltantes, status != SUCCESS) devuelve false. El caller debe rechazar
 * el request.
 */
export async function verifyWebhookSignature(p: VerifyWebhookParams): Promise<boolean> {
  const requiredHeaders = [
    "paypal-auth-algo",
    "paypal-cert-url",
    "paypal-transmission-id",
    "paypal-transmission-sig",
    "paypal-transmission-time",
  ];
  for (const h of requiredHeaders) {
    if (!p.headers[h]) return false;
  }

  let token: string;
  try {
    token = await getAccessToken(p.cfg);
  } catch {
    return false;
  }

  const res = await fetch(`${p.cfg.base}/v1/notifications/verify-webhook-signature`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      auth_algo: p.headers["paypal-auth-algo"],
      cert_url: p.headers["paypal-cert-url"],
      transmission_id: p.headers["paypal-transmission-id"],
      transmission_sig: p.headers["paypal-transmission-sig"],
      transmission_time: p.headers["paypal-transmission-time"],
      webhook_id: p.webhookId,
      webhook_event: p.body,
    }),
    cache: "no-store",
  });
  if (!res.ok) return false;
  const data = (await res.json()) as { verification_status?: string };
  return data.verification_status === "SUCCESS";
}
