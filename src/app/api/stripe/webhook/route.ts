import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { getStripe, getStripeWebhookSecret } from "@/lib/stripe/client";
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
 * Configuración (orden de prioridad — DB → env):
 *   1. Admin → Configuración → Integraciones → Stripe → guardar
 *      `secret_key` + `webhook_secret`. RECOMENDADO. Cambios inmediatos
 *      sin re-deploy.
 *   2. Fallback: `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` en
 *      `.env.local` del server.
 *
 * Para probar local: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
 * y usar el `whsec_...` que imprime el CLI.
 */
// PM 2026-07-02: helper para persistir cada intento en webhook_event_log.
// Silencioso: si la migración no está aplicada o la tabla no existe, no
// bloqueamos la respuesta al webhook.
async function logWebhookAttempt(args: {
  eventType: string | null;
  eventId: string | null;
  statusCode: number;
  outcome: string;
  message: string | null;
  payloadSnippet: string | null;
  invoiceId?: string | null;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    await (admin as unknown as { from: (t: string) => { insert: (row: Record<string, unknown>) => Promise<unknown> } })
      .from("webhook_event_log")
      .insert({
        provider: "stripe",
        event_type: args.eventType,
        event_id: args.eventId,
        status_code: args.statusCode,
        outcome: args.outcome,
        message: args.message,
        payload_snippet: args.payloadSnippet ? args.payloadSnippet.slice(0, 1000) : null,
        invoice_id: args.invoiceId ?? null,
      });
  } catch (e) {
    // Migración no aplicada aún o tabla ausente — solo warning.
    console.warn("[stripe-webhook] no se pudo persistir el log:", e);
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // PM 2026-06-29: secret leído desde DB primero (payment_provider_configs),
  // fallback a env. Permite al admin configurar el webhook desde el panel
  // sin re-deploy.
  const secret = await getStripeWebhookSecret();
  if (!secret) {
    console.error("[stripe-webhook] webhook_secret no configurado (ni en DB ni en env)");
    await logWebhookAttempt({
      eventType: null,
      eventId: null,
      statusCode: 500,
      outcome: "no_secret",
      message: "webhook_secret no configurado en DB ni en env",
      payloadSnippet: rawBody.slice(0, 500),
    });
    return NextResponse.json(
      { error: "Webhook no configurado. Andá a Admin → Configuración → Integraciones → Stripe y pegá el Webhook Secret." },
      { status: 500 }
    );
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    await logWebhookAttempt({
      eventType: null,
      eventId: null,
      statusCode: 400,
      outcome: "missing_signature",
      message: "Header stripe-signature ausente. ¿Llegó del proxy Caddy?",
      payloadSnippet: rawBody.slice(0, 500),
    });
    return NextResponse.json({ error: "Falta firma" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const stripe = await getStripe();
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    // PM 2026-07-02: incluir los últimos 6 chars del whsec_ usado para
    // que el operador compare visualmente contra el del Stripe Dashboard
    // sin exponer el secret completo.
    const secretTail = secret.length >= 6 ? secret.slice(-6) : "?";
    console.warn("[stripe-webhook] firma inválida:", e);
    await logWebhookAttempt({
      eventType: null,
      eventId: null,
      statusCode: 400,
      outcome: "signature_invalid",
      message: `Firma inválida. whsec_ usado termina en ...${secretTail}. Compará contra el del Stripe Dashboard → Webhooks → Signing secret. (${errMsg.slice(0, 150)})`,
      payloadSnippet: rawBody.slice(0, 500),
    });
    return NextResponse.json(
      { error: "Firma inválida" },
      { status: 400 }
    );
  }

  let handlerInvoiceId: string | null = null;
  let outcome = "ok";
  let handlerMessage: string | null = null;
  let statusCode = 200;
  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        handlerInvoiceId = await markInvoicePaidFromSession(session);
        handlerMessage = handlerInvoiceId
          ? `Factura ${handlerInvoiceId} marcada como pagada.`
          : "Sesión sin invoice_id resoluble. Ver metadata.";
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
        handlerMessage = `payment_failed notificado. Motivo: ${reason}`;
        break;
      }
      default:
        outcome = "unhandled_type";
        handlerMessage = `Evento ${event.type} recibido pero no tenemos handler para él.`;
        break;
    }
  } catch (e) {
    console.error("[stripe-webhook] handler error:", e);
    outcome = "handler_error";
    statusCode = 500;
    handlerMessage = e instanceof Error ? e.message : String(e);
  }

  await logWebhookAttempt({
    eventType: event.type,
    eventId: event.id,
    statusCode,
    outcome,
    message: handlerMessage,
    payloadSnippet: JSON.stringify(event).slice(0, 1000),
    invoiceId: handlerInvoiceId,
  });

  if (statusCode !== 200) {
    // Devolvemos 500 para que Stripe reintente (tiene backoff exponencial).
    return NextResponse.json(
      { error: "Error procesando evento" },
      { status: statusCode }
    );
  }

  return NextResponse.json({ received: true });
}

async function markInvoicePaidFromSession(
  session: Stripe.Checkout.Session
): Promise<string | null> {
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
    return null;
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
  return invoiceId;
}

// PM 2026-07-02: endpoint GET responde 200 con info básica. Sirve para
// que el admin (o el propio cliente sin acceso al Stripe Dashboard) haga
// un ping y confirme que la URL es accesible desde internet:
//   curl https://livinginprdise.com/api/stripe/webhook
// Si devuelve 200 con este JSON, la URL está expuesta y Stripe puede
// alcanzarla. Si devuelve 404, hay un problema con Caddy/routing.
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "stripe-webhook",
    note: "URL accesible. Este GET es solo para diagnóstico — Stripe siempre usa POST con firma.",
    time: new Date().toISOString(),
  });
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
