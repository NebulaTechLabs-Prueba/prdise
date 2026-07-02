"use server";

import { createClient } from "@/lib/supabase/server";
import { getAdminOrError } from "./_shared";
import type { ActionResult } from "./types";
import { sendEmail } from "@/lib/email/transactional";
import { buildGenericEmailHtml } from "@/lib/email/templates/generic";
import { z } from "zod";

const composeSchema = z.object({
  to: z.string().trim().email("Email destino inválido").max(200),
  toName: z.string().trim().max(200).optional().or(z.literal("")),
  subject: z.string().trim().min(1, "Asunto requerido").max(300),
  body: z.string().trim().min(1, "Cuerpo requerido").max(20000),
});

/**
 * PM 2026-07-02: envía un email libre desde el admin y lo persiste en
 * outbound_emails para que aparezca en el Buzón → Enviados.
 * Best-effort: si Resend falla o no está configurado, persiste con
 * status="failed"|"skipped" para que el admin sepa qué pasó.
 */
export async function sendComposedEmail(
  formData: FormData
): Promise<
  ActionResult<{ status: "sent" | "skipped" | "failed"; id: string; providerMessageId: string | null; reason: string | null }>
> {
  const guard = await getAdminOrError();
  if (!guard.ok) return guard;
  const actorId = guard.current.user.id;

  const parsed = composeSchema.safeParse({
    to: formData.get("to") ?? "",
    toName: formData.get("toName") ?? "",
    subject: formData.get("subject") ?? "",
    body: formData.get("body") ?? "",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }
  const d = parsed.data;

  // PM 2026-07-02: template HTML con branding + contacto en el footer.
  // Antes el compose enviaba solo un <div> plano; el destinatario recibía
  // texto blanco sin identidad. Reusamos el mismo template que las
  // facturas (header dorado con "Living in PRDISE", subject, body con
  // line-breaks preservados, footer con contact_email + whatsapp).
  const supabase = await createClient();
  const { data: settingsRows } = await supabase
    .from("site_settings")
    .select("key, value")
    .in("key", ["contact_email", "whatsapp_phone"]);
  const settings: Record<string, string> = {};
  for (const r of (settingsRows as { key: string; value: string }[] | null) ?? []) {
    settings[r.key] = r.value;
  }
  const htmlBody = buildGenericEmailHtml({
    toName: d.toName || null,
    subject: d.subject,
    body: d.body,
    brandContactEmail: settings.contact_email || null,
    brandWhatsapp: settings.whatsapp_phone || null,
  });
  // reply-to = contact_email de settings. El sender técnico
  // (noreply@livinginprdise.com) no recibe, pero si el destinatario
  // responde, la respuesta se enruta al buzón real.
  const replyToAddr = settings.contact_email || undefined;

  const emailRes = await sendEmail({
    to: d.to,
    subject: d.subject,
    html: htmlBody,
    text: d.body,
    replyTo: replyToAddr,
  });

  let status: "sent" | "skipped" | "failed";
  let providerMessageId: string | null = null;
  let reason: string | null = null;

  if (emailRes.ok && "skipped" in emailRes && emailRes.skipped) {
    status = "skipped";
    reason = emailRes.reason;
  } else if (emailRes.ok && "id" in emailRes) {
    status = "sent";
    providerMessageId = emailRes.id || null;
  } else if (!emailRes.ok) {
    status = "failed";
    reason = emailRes.error;
  } else {
    status = "failed";
    reason = "estado desconocido";
  }

  const { data: inserted, error } = await (supabase as unknown as {
    from: (t: string) => {
      insert: (row: Record<string, unknown>) => {
        select: (cols: string) => {
          single: () => Promise<{ data: { id: string } | null; error: { message: string } | null }>;
        };
      };
    };
  })
    .from("outbound_emails")
    .insert({
      to_address: d.to,
      to_name: d.toName || null,
      subject: d.subject,
      body_text: d.body,
      body_html: htmlBody,
      provider: "resend",
      provider_message_id: providerMessageId,
      status,
      status_reason: reason,
      sent_by: actorId,
      kind: "compose",
    })
    .select("id")
    .single();

  if (error || !inserted) {
    // Tabla no existe todavía (migración pendiente) — devolvemos el status
    // real igual, aunque no quede persistido.
    return {
      ok: true,
      data: { status, id: "not-persisted", providerMessageId, reason },
    };
  }

  return {
    ok: true,
    data: { status, id: inserted.id, providerMessageId, reason },
  };
}

export type OutboundEmailRow = {
  id: string;
  to_address: string;
  to_name: string | null;
  subject: string;
  body_text: string;
  status: string;
  status_reason: string | null;
  sent_at: string;
  kind: string | null;
};

/**
 * Lista los últimos correos enviados desde el sistema. Se usa en el tab
 * "Enviados" del Buzón.
 */
export async function listOutboundEmails(
  limit = 50
): Promise<OutboundEmailRow[]> {
  const guard = await getAdminOrError();
  if (!guard.ok) return [];

  const supabase = await createClient();
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        order: (col: string, opts: { ascending: boolean }) => {
          limit: (n: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
        };
      };
    };
  })
    .from("outbound_emails")
    .select(
      "id, to_address, to_name, subject, body_text, status, status_reason, sent_at, kind"
    )
    .order("sent_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) {
    console.warn("[listOutboundEmails]", error.message);
    return [];
  }
  return (data ?? []) as OutboundEmailRow[];
}
