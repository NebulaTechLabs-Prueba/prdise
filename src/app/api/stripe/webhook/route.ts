import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/admin";

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
      // Otros eventos (payment_link.created, payment_intent.payment_failed)
      // se ignoran silenciosamente. Stripe espera 2xx para no reintentar.
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
  const { error } = await admin
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      payment_ref: session.payment_intent
        ? String(session.payment_intent)
        : session.id,
    })
    .eq("id", invoiceId)
    .neq("status", "paid"); // idempotente: no re-actualiza si ya está paid

  if (error) {
    console.error(
      "[stripe-webhook] no se pudo marcar invoice paid:",
      error.message
    );
    throw error;
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
