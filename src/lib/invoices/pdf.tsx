/* eslint-disable jsx-a11y/alt-text */
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  pdf,
} from "@react-pdf/renderer";
import type { Tables } from "@/lib/supabase/database.types";

// Tipos públicos para que callers (Server Actions) no necesiten importar
// la lib `@react-pdf/renderer` solo para el shape.
export type InvoiceForPdf = Tables<"invoices"> & {
  items: Tables<"invoice_items">[];
};

// ─── Estilos ────────────────────────────────────────────────────────────────
// Paleta acorde a la marca PRDISE (gold/orange sobre fondo claro para el PDF;
// el PDF se imprime/lee fuera del sitio, mantenemos contraste alto).
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
    color: "#1a0f2e",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 24,
    paddingBottom: 16,
    borderBottomWidth: 2,
    borderBottomColor: "#F5A623",
  },
  brand: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#F5A623",
    letterSpacing: 3,
  },
  brandSub: {
    fontSize: 8,
    color: "#888",
    marginTop: 2,
    letterSpacing: 1,
  },
  invoiceMeta: {
    textAlign: "right",
  },
  invoiceNumber: {
    fontSize: 14,
    fontWeight: "bold",
    color: "#1a0f2e",
  },
  invoiceMetaRow: {
    fontSize: 9,
    color: "#666",
    marginTop: 2,
  },
  section: {
    marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 8,
    color: "#888",
    fontWeight: "bold",
    letterSpacing: 1.5,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  customerName: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#1a0f2e",
  },
  customerLine: {
    fontSize: 9,
    color: "#444",
    marginTop: 2,
  },
  table: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  tableHeader: {
    backgroundColor: "#fafafa",
    fontWeight: "bold",
    fontSize: 8,
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  colDesc: { flex: 4, paddingHorizontal: 6 },
  colQty: { flex: 1, paddingHorizontal: 6, textAlign: "right" },
  colUnit: { flex: 1.4, paddingHorizontal: 6, textAlign: "right" },
  colTotal: { flex: 1.4, paddingHorizontal: 6, textAlign: "right" },
  totals: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 14,
  },
  totalsBox: {
    width: 220,
  },
  totalsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  totalsRowFinal: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginTop: 4,
    borderTopWidth: 2,
    borderTopColor: "#F5A623",
    fontSize: 13,
    fontWeight: "bold",
  },
  notes: {
    marginTop: 24,
    padding: 12,
    backgroundColor: "#fafafa",
    fontSize: 9,
    color: "#444",
  },
  payBlock: {
    marginTop: 24,
    padding: 14,
    borderWidth: 1,
    borderColor: "#F5A623",
    borderRadius: 6,
  },
  payTitle: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#1a0f2e",
  },
  payUrl: {
    fontSize: 9,
    color: "#0066cc",
    marginTop: 6,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    textAlign: "center",
    fontSize: 8,
    color: "#999",
    borderTopWidth: 1,
    borderTopColor: "#eee",
    paddingTop: 8,
  },
});

function fmtUsd(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

// ─── Documento React-PDF ────────────────────────────────────────────────────
function InvoiceDoc({ invoice }: { invoice: InvoiceForPdf }) {
  const statusLabel = invoice.status === "paid"
    ? "PAGADA"
    : invoice.status === "pending"
      ? "PENDIENTE DE PAGO"
      : invoice.status === "draft"
        ? "BORRADOR"
        : invoice.status.toUpperCase();

  return (
    <Document>
      <Page size="LETTER" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>PRDISE</Text>
            <Text style={styles.brandSub}>LIVING IN PARADISE · CABO ROJO, PUERTO RICO</Text>
          </View>
          <View style={styles.invoiceMeta}>
            <Text style={styles.invoiceNumber}>{invoice.number}</Text>
            <Text style={styles.invoiceMetaRow}>Emitida: {invoice.issued_at}</Text>
            {invoice.due_at && (
              <Text style={styles.invoiceMetaRow}>Vence: {invoice.due_at}</Text>
            )}
            <Text style={[styles.invoiceMetaRow, { marginTop: 6, fontWeight: "bold", color: invoice.status === "paid" ? "#2a9d2a" : "#F5A623" }]}>
              {statusLabel}
            </Text>
          </View>
        </View>

        {/* Cliente */}
        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Facturar a</Text>
          <Text style={styles.customerName}>{invoice.customer_name}</Text>
          <Text style={styles.customerLine}>{invoice.customer_email}</Text>
          {invoice.customer_phone && (
            <Text style={styles.customerLine}>Tel: {invoice.customer_phone}</Text>
          )}
          {invoice.customer_whatsapp && invoice.customer_whatsapp !== invoice.customer_phone && (
            <Text style={styles.customerLine}>WhatsApp: {invoice.customer_whatsapp}</Text>
          )}
        </View>

        {/* Tabla de items */}
        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <Text style={styles.colDesc}>Descripción</Text>
            <Text style={styles.colQty}>Cant.</Text>
            <Text style={styles.colUnit}>Precio unit.</Text>
            <Text style={styles.colTotal}>Total</Text>
          </View>
          {invoice.items.map((it) => (
            <View key={it.id} style={styles.tableRow}>
              <Text style={styles.colDesc}>{it.description}</Text>
              <Text style={styles.colQty}>{it.quantity}</Text>
              <Text style={styles.colUnit}>{fmtUsd(it.unit_cents)}</Text>
              <Text style={styles.colTotal}>{fmtUsd(it.line_total_cents)}</Text>
            </View>
          ))}
        </View>

        {/* Totales */}
        <View style={styles.totals}>
          <View style={styles.totalsBox}>
            <View style={styles.totalsRow}>
              <Text style={{ color: "#666" }}>Subtotal</Text>
              <Text>{fmtUsd(invoice.subtotal_cents)}</Text>
            </View>
            {invoice.discount_cents > 0 && (
              <View style={styles.totalsRow}>
                <Text style={{ color: "#666" }}>Descuento</Text>
                <Text>−{fmtUsd(invoice.discount_cents)}</Text>
              </View>
            )}
            {invoice.tax_cents > 0 && (
              <View style={styles.totalsRow}>
                <Text style={{ color: "#666" }}>Impuestos</Text>
                <Text>{fmtUsd(invoice.tax_cents)}</Text>
              </View>
            )}
            <View style={styles.totalsRowFinal}>
              <Text>Total</Text>
              <Text>{fmtUsd(invoice.total_cents)}</Text>
            </View>
          </View>
        </View>

        {/* Pago */}
        {invoice.stripe_payment_link_url && invoice.status !== "paid" && (
          <View style={styles.payBlock}>
            <Text style={styles.payTitle}>Pagar en línea (Stripe)</Text>
            <Text style={styles.payUrl}>{invoice.stripe_payment_link_url}</Text>
          </View>
        )}

        {/* Notas */}
        {invoice.notes && (
          <View style={styles.notes}>
            <Text style={styles.sectionLabel}>Notas</Text>
            <Text>{invoice.notes}</Text>
          </View>
        )}

        {/* Footer */}
        <Text style={styles.footer} fixed>
          PRDISE — Living in Paradise · Cabo Rojo, Puerto Rico · Gracias por elegirnos.
        </Text>
      </Page>
    </Document>
  );
}

/**
 * Renderiza la factura a un Buffer PDF (server-side). Se usa desde Server
 * Actions para subir el resultado a Supabase Storage.
 */
export async function renderInvoicePdf(invoice: InvoiceForPdf): Promise<Buffer> {
  const instance = pdf(<InvoiceDoc invoice={invoice} />);
  const blob = await instance.toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
