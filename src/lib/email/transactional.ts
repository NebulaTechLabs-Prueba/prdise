/**
 * Email transaccional vía Resend API.
 *
 * PM 2026-07-02: Resend ya está configurado como Custom SMTP en Supabase
 * Auth (para reset password / signup confirm). Reusamos la misma cuenta
 * vía su API HTTP para enviar los emails transaccionales de la aplicación
 * (facturas, notificaciones al cliente, etc.).
 *
 * Configuración esperada en el `.env.local` del server:
 *   - RESEND_API_KEY     API key de Resend (re_...) — misma cuenta que
 *                        está en Supabase → Auth → Emails → SMTP.
 *   - RESEND_FROM_EMAIL  Sender verificado en Resend (ej: "PRDISE
 *                        <hello@livinginprdise.com>"). Debe usar un
 *                        dominio validado por DNS.
 *
 * Si RESEND_API_KEY no está seteada, devolvemos `skipped: true` en lugar
 * de tirar — el flow de negocio (crear factura, etc.) no debe fallar
 * porque el email no se pueda mandar. El caller decide qué hacer.
 */

type SendEmailResult =
  | { ok: true; id: string }
  | { ok: true; skipped: true; reason: string }
  | { ok: false; error: string };

export async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  from?: string;
  replyTo?: string;
}): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: true, skipped: true, reason: "resend-not-configured" };
  }
  const from =
    args.from ||
    process.env.RESEND_FROM_EMAIL ||
    "PRDISE <hello@livinginprdise.com>";

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [args.to],
        subject: args.subject,
        html: args.html,
        text: args.text,
        reply_to: args.replyTo,
      }),
      cache: "no-store",
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
      name?: string;
    };
    if (!res.ok) {
      const err = data.message || data.name || `HTTP ${res.status}`;
      return { ok: false, error: `Resend: ${err}` };
    }
    return { ok: true, id: data.id || "" };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
