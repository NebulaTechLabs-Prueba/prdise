import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAllAdmins } from "@/lib/admin/notifications";

// El webhook necesita el body crudo para verificar la firma. Forzamos runtime
// Node (no edge) y deshabilitamos el cache.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Webhook de Stripe para sincronizar el estado de pago de las invoices.
 *
 * Eventos manejados:
 *   - checkout.session.completed: el cliente completó el checkout del Payment
 *     Link → marcamos la invoice como 'paid'. La asociación se hace vía
 *     `metadata.invoice_id` que dejamos al crear el Payment Link en
 *     `createInvoiceManual`.
 *
 * Configuración requerida en `.env`:
 *   - STRIPE_SECRET_KEY     (usado por getStripe() para construir eventos)
 *   - STRIPE_WEBHOOK_SECRET (firma del endpoint en Stripe Dashboard)
 *
 * Para probar local: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
 * y usar el `whsec_...` que imprime el CLI.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[stripe-webhook] STRIPE_WEBHOOK_SECRET no configurada");
    return NextResponse.json(
      { error: "Webhook no configurado" },
      { status: 500 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Falta firma" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (e) {
    console.warn("[stripe-webhook] firma inválida:", e);
    return NextResponse.json(
      { error: "Firma inválida" },
      { status: 400 }
    );
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        await markInvoicePaidFromSession(session);
        break;
      }
      // PM 2026-06-23: si el cliente tiene este evento configurado en el
      // dashboard de Stripe ("payment_intent.payment_failed"), notificamos
      // al admin. No marcamos la invoice como failed automáticamente —
      // el cliente puede reintentar el mismo payment link.
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        const reason = pi.last_payment_error?.message || "sin detalle";
        await notifyAllAdmins({
          kind: "failed_payment",
          title_es: "Pago fallido (Stripe)",
          title_en: "Payment failed (Stripe)",
          body_es: `PaymentIntent ${pi.id} — motivo: ${reason}`,
          body_en: `PaymentIntent ${pi.id} — reason: ${reason}`,
          link: "/admin?section=invoices",
        });
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.error("[stripe-webhook] handler error:", e);
    // Devolvemos 500 para que Stripe reintente (tiene backoff exponencial).
    return NextResponse.json(
      { error: "Error procesando evento" },
      { status: 500 }
    );
  }

  return NextResponse.json({ received: true });
}

async function markInvoicePaidFromSession(
  session: Stripe.Checkout.Session
): Promise<void> {
  const invoiceId =
    (session.metadata?.invoice_id as string | undefined) ??
    (session.payment_link
      ? await resolveInvoiceFromPaymentLink(session.payment_link as string)
      : null);

  if (!invoiceId) {
    console.warn(
      "[stripe-webhook] checkout.session.completed sin invoice_id resoluble",
      { sessionId: session.id }
    );
    return;
  }

  const admin = createAdminClient();
  // Buscamos los datos de la invoice ANTES del update para incluirlos en la
  // notificación (number, total, customer). Solo se notifica si el update
  // realmente cambió el estado (idempotencia + evita doble bell en reintentos).
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
      payment_ref: session.payment_intent
        ? String(session.payment_intent)
        : session.id,
    })
    .eq("id", invoiceId)
    .neq("status", "paid") // idempotente: no re-actualiza si ya está paid
    .select("id");

  if (error) {
    console.error(
      "[stripe-webhook] no se pudo marcar invoice paid:",
      error.message
    );
    throw error;
  }

  // PM 2026-06-23: notificar a los admins solo si el update efectivamente
  // cambió el estado (updated.length > 0). Si ya estaba paid, fue un retry
  // de Stripe → no spamear.
  if (updated && updated.length > 0 && inv) {
    const amount = (inv.total_cents / 100).toFixed(2);
    await notifyAllAdmins({
      kind: "successful_payment",
      title_es: "Pago recibido (Stripe)",
      title_en: "Payment received (Stripe)",
      body_es: `Factura ${inv.number} de ${inv.customer_name || "cliente"} — $${amount} pagada vía Stripe.`,
      body_en: `Invoice ${inv.number} from ${inv.customer_name || "customer"} — $${amount} paid via Stripe.`,
      link: "/admin?section=invoices",
    });
  }
}

async function resolveInvoiceFromPaymentLink(
  paymentLinkId: string
): Promise<string | null> {
  // Fallback si el evento no trae metadata.invoice_id directo: buscamos por
  // stripe_payment_link_id en nuestra tabla.
  const admin = createAdminClient();
  const { data } = await admin
    .from("invoices")
    .select("id")
    .eq("stripe_payment_link_id", paymentLinkId)
    .maybeSingle();
  return data?.id ?? null;
}
