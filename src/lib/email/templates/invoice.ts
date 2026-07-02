/**
 * Template HTML de la factura al cliente.
 *
 * PM 2026-07-02: mail-safe HTML — tablas + estilos inline. Sin <link>, sin
 * clases, sin JS. Escapamos cualquier contenido del cliente (nombre, notas)
 * para evitar inyección de HTML. Los caracteres del set ASCII básico
 * pasan; el resto queda como &#N; via HTMLEntityEncode.
 */

const escapeHtml = (s: string): string =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

type InvoiceEmailData = {
  invoiceNumber: string;
  customerName: string;
  totalUsd: string; // formateado sin símbolo, e.g. "0.60"
  paymentLinkUrl?: string | null;
  pdfUrl?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  brandContactEmail?: string | null;
  brandWhatsapp?: string | null; // solo dígitos internacional, sin "+"
};

export function buildInvoiceEmailSubject(d: InvoiceEmailData): string {
  return `Factura ${d.invoiceNumber} — Living in PRDISE`;
}

export function buildInvoiceEmailHtml(d: InvoiceEmailData): string {
  const {
    invoiceNumber,
    customerName,
    totalUsd,
    paymentLinkUrl,
    pdfUrl,
    dueDate,
    notes,
    brandContactEmail,
    brandWhatsapp,
  } = d;

  const cta = paymentLinkUrl
    ? `
      <tr><td style="padding:24px 0 8px 0;">
        <a href="${escapeHtml(paymentLinkUrl)}" style="display:inline-block;padding:14px 28px;background:#F5A623;color:#0F1822;text-decoration:none;font-weight:800;letter-spacing:.06em;text-transform:uppercase;font-size:13px;border-radius:8px;">Pagar factura</a>
      </td></tr>
      <tr><td style="padding:0 0 8px 0;font-size:12px;color:#6B7280;">
        Enlace de pago seguro procesado por Stripe.
      </td></tr>`
    : "";

  const pdfRow = pdfUrl
    ? `
      <tr><td style="padding:8px 0;font-size:13px;color:#374151;">
        <a href="${escapeHtml(pdfUrl)}" style="color:#F5A623;text-decoration:underline;">Ver PDF de la factura</a>
      </td></tr>`
    : "";

  const dueRow = dueDate
    ? `
      <tr><td style="padding:4px 0;font-size:13px;color:#374151;">
        <strong>Vence:</strong> ${escapeHtml(dueDate)}
      </td></tr>`
    : "";

  const notesRow = notes
    ? `
      <tr><td style="padding:16px 0 8px 0;">
        <div style="padding:12px 14px;background:#FEF3C7;border-left:3px solid #F5A623;font-size:13px;color:#374151;border-radius:4px;">
          <div style="font-weight:700;color:#92400E;margin-bottom:4px;text-transform:uppercase;letter-spacing:.08em;font-size:10px;">Notas</div>
          <div style="white-space:pre-wrap;">${escapeHtml(notes)}</div>
        </div>
      </td></tr>`
    : "";

  const contactParts: string[] = [];
  if (brandContactEmail) contactParts.push(escapeHtml(brandContactEmail));
  if (brandWhatsapp) contactParts.push(`WhatsApp +${escapeHtml(brandWhatsapp)}`);
  const contactLine = contactParts.length
    ? `<p style="margin:8px 0 0 0;font-size:11.5px;color:#9CA3AF;">Consultas: ${contactParts.join(" · ")}</p>`
    : "";

  return `<!doctype html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(
    buildInvoiceEmailSubject(d)
  )}</title></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F3F4F6;padding:32px 12px;">
  <tr><td align="center">
    <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(15,24,34,.06);">
      <tr><td style="padding:28px 32px 8px 32px;border-bottom:2px solid #F5A623;">
        <div style="font-size:12px;font-weight:800;letter-spacing:.18em;color:#F5A623;text-transform:uppercase;">Living in PRDISE</div>
        <div style="margin-top:14px;font-size:22px;font-weight:800;color:#0F1822;">Factura ${escapeHtml(
          invoiceNumber
        )}</div>
        <div style="margin-top:2px;font-size:13px;color:#6B7280;">Hola ${escapeHtml(
          customerName
        )},</div>
      </td></tr>
      <tr><td style="padding:20px 32px 8px 32px;font-size:14px;color:#0F1822;line-height:1.55;">
        Te compartimos tu factura por un total de <strong>USD ${escapeHtml(
          totalUsd
        )}</strong>. ${
    paymentLinkUrl
      ? "Podés pagarla en línea con el botón de abajo."
      : "El equipo se comunicará con vos para coordinar el pago."
  }
      </td></tr>
      <tr><td style="padding:0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${cta}${dueRow}${pdfRow}${notesRow}</table>
      </td></tr>
      <tr><td style="padding:20px 32px 28px 32px;border-top:1px solid #E5E7EB;">
        <p style="margin:0;font-size:12px;color:#6B7280;">Gracias por tu preferencia.</p>
        ${contactLine}
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>`;
}

export function buildInvoiceEmailText(d: InvoiceEmailData): string {
  const lines: string[] = [
    `Hola ${d.customerName},`,
    "",
    `Te compartimos la factura ${d.invoiceNumber} por un total de USD ${d.totalUsd}.`,
  ];
  if (d.paymentLinkUrl) {
    lines.push("", `Podés pagarla en línea acá: ${d.paymentLinkUrl}`);
  }
  if (d.dueDate) lines.push("", `Vence: ${d.dueDate}`);
  if (d.pdfUrl) lines.push("", `PDF de la factura: ${d.pdfUrl}`);
  if (d.notes) lines.push("", `Notas: ${d.notes}`);
  lines.push("", "Gracias por tu preferencia.", "— Living in PRDISE");
  return lines.join("\n");
}
