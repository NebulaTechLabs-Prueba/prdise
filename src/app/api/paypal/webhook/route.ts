import { NextRequest, NextResponse } from "next/server";
import {
  getPayPalConfig,
  verifyWebhookSignature,
} from "@/lib/paypal/client";
import { createAdminClient } from "@/lib/supabase/admin";

// Body crudo + ejecución Node (firma se calcula sobre el JSON exacto que
// recibió PayPal; el edge runtime puede normalizar y romper la verificación).
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook de PayPal — paridad con el de Stripe (./api/stripe/webhook).
 *
 * Eventos manejados:
 *   - PAYMENT.CAPTURE.COMPLETED: PayPal capturó el pago (intent=CAPTURE)
 *     → marcamos invoice como 'paid'. Resolvemos invoice_id desde
 *     `resource.custom_id` (lo seteamos al crear el Order) y, si falta,
 *     fallback a buscar por `paypal_order_id`.
 *
 * Configuración requerida en `.env`:
 *   - PAYPAL_ENV            'sandbox' | 'live'
 *   - PAYPAL_CLIENT_ID
 *   - PAYPAL_SECRET
 *   - PAYPAL_WEBHOOK_ID     ID del webhook configurado en PayPal Dashboard
 *
 * Setup en PayPal Dashboard → Apps → tu app → Webhooks:
 *   URL    https://livinginprdise.com/api/paypal/webhook
 *   Events PAYMENT.CAPTURE.COMPLETED
 */
export async function POST(req: NextRequest) {
  const cfg = getPayPalConfig();
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!cfg || !webhookId) {
    console.error("[paypal-webhook] PAYPAL_* no configuradas");
    return NextResponse.json(
      { error: "Webhook no configurado" },
      { status: 500 }
    );
  }

  const rawBody = await req.text();
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  // Headers PayPal-* en lowercase para verify-webhook-signature
  const headers: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });

  const verified = await verifyWebhookSignature({
    cfg,
    webhookId,
    headers,
    body,
  });
  if (!verified) {
    console.warn("[paypal-webhook] firma inválida o headers faltantes");
    return NextResponse.json({ error: "Firma inválida" }, { status: 400 });
  }

  try {
    const eventType = String(body.event_type ?? "");
    if (eventType === "PAYMENT.CAPTURE.COMPLETED") {
      await markInvoicePaidFromCapture(body);
    }
    // Otros eventos (CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.DENIED, etc.)
    // se ignoran silenciosamente — PayPal espera 2xx para no reintentar.
  } catch (e) {
    console.error("[paypal-webhook] handler error:", e);
    // 500 → PayPal reintenta con backoff (igual semántica que Stripe)
    return NextResponse.json(
      { error: "Error procesando evento" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

type CaptureResource = {
  id?: string;
  custom_id?: string;
  invoice_id?: string;
  supplementary_data?: { related_ids?: { order_id?: string } };
};

async function markInvoicePaidFromCapture(
  event: Record<string, unknown>
): Promise<void> {
  const resource = (event.resource ?? {}) as CaptureResource;
  let invoiceId = resource.custom_id ?? null;

  // Fallback: si custom_id no llegó (no debería pasar — lo seteamos al crear
  // la Order), resolvemos buscando por paypal_order_id en nuestra DB.
  if (!invoiceId) {
    const orderId = resource.supplementary_data?.related_ids?.order_id;
    if (orderId) {
      const admin = createAdminClient();
      const { data } = await admin
        .from("invoices")
        .select("id")
        .eq("paypal_order_id", orderId)
        .maybeSingle();
      invoiceId = data?.id ?? null;
    }
  }

  if (!invoiceId) {
    console.warn("[paypal-webhook] capture sin invoice_id resoluble", {
      captureId: resource.id,
    });
    return;
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_ref: resource.id ?? null,
    })
    .eq("id", invoiceId)
    .neq("status", "paid"); // idempotente

  if (error) {
    console.error(
      "[paypal-webhook] no se pudo marcar invoice paid:",
      error.message
    );
    throw error;
  }
}
