import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAllAdmins } from "@/lib/admin/notifications";

/**
 * PM 2026-07-02: endpoint de SIMULACIÓN del webhook de Stripe. Reproduce
 * `checkout.session.completed` sin pasar por Stripe (Stripe en live cuesta
 * dinero por cada intento real de test).
 *
 * Uso desde Postman:
 *   POST https://livinginprdise.com/api/stripe/webhook/simulate
 *   Headers:
 *     Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *     Content-Type: application/json
 *   Body:
 *     { "invoice_number": "INV-2026-0007" }
 *   ó
 *     { "invoice_id": "23f6554d-77f2-4a80-a763-16fc61a24892" }
 *
 * Ejecuta exactamente el mismo flujo que el webhook real:
 *   - Actualiza status → 'paid' + paid_at + payment_ref.
 *   - Notifica a todos los admins (bell).
 *   - Persiste en webhook_event_log con outcome='simulated'.
 *
 * Idempotente: si la factura ya estaba paid, no re-actualiza ni re-notifica.
 * Solo admin (bearer service_role) puede invocarlo; no expuesto al público.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  // Auth: comparación exacta contra service_role. No comparamos usando
  // === directo por timing side-channel — usamos length-check + xor.
  const auth = req.headers.get("authorization") || "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
  const expected = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!expected || provided.length !== expected.length || !constantTimeEq(provided, expected)) {
    return NextResponse.json(
      { error: "Unauthorized. Usar Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>." },
      { status: 401 }
    );
  }

  let body: { invoice_id?: string; invoice_number?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body JSON inválido" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Resolver la factura por id o por number.
  let invoiceId = body.invoice_id?.trim();
  if (!invoiceId && body.invoice_number) {
    const { data } = await admin
      .from("invoices")
      .select("id")
      .eq("number", body.invoice_number.trim())
      .maybeSingle();
    invoiceId = data?.id ?? undefined;
  }
  if (!invoiceId) {
    return NextResponse.json(
      { error: "Body debe incluir 'invoice_id' (uuid) o 'invoice_number' (INV-YYYY-NNNN)" },
      { status: 400 }
    );
  }

  // Fetch antes del update para poder notificar con datos y detectar
  // idempotencia (si ya estaba paid).
  const { data: inv } = await admin
    .from("invoices")
    .select("id, number, customer_name, total_cents, status")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!inv) {
    return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });
  }

  const alreadyPaid = inv.status === "paid";
  let notified = false;

  if (!alreadyPaid) {
    const paymentRef = `simulated-${Date.now()}`;
    const { error: updErr } = await admin
      .from("invoices")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        payment_ref: paymentRef,
      })
      .eq("id", invoiceId)
      .neq("status", "paid");

    if (updErr) {
      return NextResponse.json(
        { error: `No se pudo marcar como pagada: ${updErr.message}` },
        { status: 500 }
      );
    }

    const amount = (inv.total_cents / 100).toFixed(2);
    await notifyAllAdmins({
      kind: "successful_payment",
      title_es: "Pago recibido (Stripe · SIMULADO)",
      title_en: "Payment received (Stripe · SIMULATED)",
      body_es: `Factura ${inv.number} de ${inv.customer_name || "cliente"} — $${amount} marcada pagada por simulación.`,
      body_en: `Invoice ${inv.number} from ${inv.customer_name || "customer"} — $${amount} marked paid via simulation.`,
      link: "/admin?section=invoices",
    });
    notified = true;
  }

  // Persistir intento en webhook_event_log para que aparezca en
  // Configuración → Integraciones → Diagnóstico del Webhook.
  try {
    await (admin as unknown as {
      from: (t: string) => { insert: (row: Record<string, unknown>) => Promise<unknown> };
    })
      .from("webhook_event_log")
      .insert({
        provider: "stripe",
        event_type: "checkout.session.completed",
        event_id: `evt_simulated_${Date.now()}`,
        status_code: 200,
        outcome: "simulated",
        message: alreadyPaid
          ? `Factura ${inv.number} ya estaba paid — no se re-notificó.`
          : `Simulación exitosa. Factura ${inv.number} marcada paid + notificación al admin.`,
        payload_snippet: JSON.stringify({ simulated: true, invoice_id: invoiceId, invoice_number: inv.number }),
        invoice_id: invoiceId,
      });
  } catch {
    // No bloqueamos si el log falla.
  }

  return NextResponse.json({
    ok: true,
    simulated: true,
    invoice: {
      id: invoiceId,
      number: inv.number,
      previous_status: inv.status,
      new_status: alreadyPaid ? inv.status : "paid",
      already_paid: alreadyPaid,
      admin_notified: notified,
    },
  });
}

// Comparación de constant-time para evitar timing attacks al matchear la key.
function constantTimeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
