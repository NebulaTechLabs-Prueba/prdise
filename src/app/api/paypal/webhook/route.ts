import { NextRequest, NextResponse } from "next/server";
import {
  getPayPalConfig,
  verifyWebhookSignature,
} from "@/lib/paypal/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAllAdmins } from "@/lib/admin/notifications";

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
    } else if (eventType === "PAYMENT.CAPTURE.DENIED" || eventType === "PAYMENT.CAPTURE.DECLINED") {
      // PM 2026-06-23: notificar pagos fallidos al admin. No tocamos el
      // estado de la invoice — el cliente puede reintentar el mismo
      // approve URL de PayPal y volverá a disparar COMPLETED si sale OK.
      const resource = (body.resource ?? {}) as { id?: string; status_details?: { reason?: string } };
      const reason = resource.status_details?.reason || "sin detalle";
      await notifyAllAdmins({
        kind: "failed_payment",
        title_es: "Pago fallido (PayPal)",
        title_en: "Payment failed (PayPal)",
        body_es: `Capture ${resource.id || "?"} — motivo: ${reason}`,
        body_en: `Capture ${resource.id || "?"} — reason: ${reason}`,
        link: "/admin?section=invoices",
      });
    }
    // Otros eventos (CHECKOUT.ORDER.APPROVED, etc.) se ignoran silenciosamente.
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
  // Datos antes del update para incluirlos en la notificación.
  const { data: inv } = await admin
    .from("invoices")
    .select("number, customer_name, total_cents, status")
    .eq("id", invoiceId)
    .maybeSingle();

  const { data: updated, error } = await admin
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_ref: resource.id ?? null,
    })
    .eq("id", invoiceId)
    .neq("status", "paid") // idempotente
    .select("id");

  // PM 2026-06-23: notificar solo si el update efectivamente marcó la
  // invoice (no en reintentos de webhook sobre invoices ya pagadas).
  if (!error && updated && updated.length > 0 && inv) {
    const amount = (inv.total_cents / 100).toFixed(2);
    await notifyAllAdmins({
      kind: "successful_payment",
      title_es: "Pago recibido (PayPal)",
      title_en: "Payment received (PayPal)",
      body_es: `Factura ${inv.number} de ${inv.customer_name || "cliente"} — $${amount} pagada vía PayPal.`,
      body_en: `Invoice ${inv.number} from ${inv.customer_name || "customer"} — $${amount} paid via PayPal.`,
      link: "/admin?section=invoices",
    });
  }

  if (error) {
    console.error(
      "[paypal-webhook] no se pudo marcar invoice paid:",
      error.message
    );
    throw error;
  }
}
