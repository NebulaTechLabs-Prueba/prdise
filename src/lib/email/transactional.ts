/**
 * Email transaccional — silencioso por ahora.
 *
 * Proveedor SMTP no decidido (Brevo descartado en esta fase).
 * Cualquier llamada try/catch no romperá el flujo de negocio hasta que se conecte un proveedor.
 */

export async function sendEmail(_args: {
  to: string;
  subject: string;
  html: string;
  text?: string;
}): Promise<{ ok: boolean; skipped?: true; reason?: string }> {
  return { ok: true, skipped: true, reason: "smtp-not-configured" };
}
