/**
 * Template HTML genérico para correos manuales (Redactar correo del admin).
 *
 * PM 2026-07-02: mismo look-and-feel que el email de factura — header con
 * brand, cuerpo del mensaje, footer con contacto. Sin CTA por defecto (el
 * admin escribe libre); el body se preserva con line-breaks y HTML
 * escapeado para evitar inyección.
 */

const escapeHtml = (s: string): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

export type GenericEmailData = {
  toName?: string | null;
  subject: string;
  body: string;
  brandContactEmail?: string | null;
  brandWhatsapp?: string | null; // dígitos internacionales sin "+"
};

export function buildGenericEmailHtml(d: GenericEmailData): string {
  const { toName, subject, body, brandContactEmail, brandWhatsapp } = d;

  const contactParts: string[] = [];
  if (brandContactEmail) contactParts.push(escapeHtml(brandContactEmail));
  if (brandWhatsapp) contactParts.push(`WhatsApp +${escapeHtml(brandWhatsapp)}`);
  const contactLine = contactParts.length
    ? `<p style="margin:8px 0 0 0;font-size:11.5px;color:#9CA3AF;">${contactParts.join(" · ")}</p>`
    : "";

  const greeting = toName
    ? `<div style="margin-top:2px;font-size:13px;color:#6B7280;">Hola ${escapeHtml(toName)},</div>`
    : "";

  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(
    subject
  )}</title></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(15,24,34,.06);">
      <tr><td style="padding:28px 32px 8px 32px;border-bottom:2px solid #F5A623;">
        <div style="font-size:12px;font-weight:800;letter-spacing:.18em;color:#F5A623;text-transform:uppercase;">Living in PRDISE</div>
        <div style="margin-top:14px;font-size:20px;font-weight:800;color:#0F1822;">${escapeHtml(
          subject
        )}</div>
        ${greeting}
      </td></tr>
      <tr><td style="padding:22px 32px;font-size:14px;color:#0F1822;line-height:1.6;white-space:pre-wrap;">${escapeHtml(
        body
      )}</td></tr>
      <tr><td style="padding:20px 32px 28px 32px;border-top:1px solid #E5E7EB;">
        <p style="margin:0;font-size:12px;color:#6B7280;">Gracias por tu preferencia.</p>
        ${contactLine}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}
