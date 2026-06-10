"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getStaffWithPermissionOrError,
  writeAuditLog,
} from "./_shared";
import type { ActionResult } from "./types";
import type { Tables } from "@/lib/supabase/database.types";
import { z } from "zod";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { renderInvoicePdf, type InvoiceForPdf } from "@/lib/invoices/pdf";

const PDF_BUCKET = "invoice-pdfs";
const PDF_SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7; // 7 días

export type InvoiceRow = Tables<"invoices"> & {
  items?: Tables<"invoice_items">[];
};

// ===========================================================================
// SCHEMAS (createInvoiceManual)
// ===========================================================================

const uuidNullable = z
  .string()
  .uuid("UUID inválido")
  .optional()
  .or(z.literal(""))
  .nullable();

const lineItemSchema = z.object({
  description: z
    .string()
    .trim()
    .min(1, "Descripción de la línea requerida")
    .max(500, "Descripción demasiado larga"),
  quantity: z.coerce
    .number()
    .int("Cantidad debe ser entero")
    .min(1, "Cantidad mínima 1")
    .max(9999, "Cantidad fuera de rango"),
  unitCents: z.coerce
    .number()
    .int("Precio unitario debe estar en centavos enteros")
    .min(0, "Precio no puede ser negativo")
    .max(100_000_000, "Precio fuera de rango"),
  // FKs opcionales al catálogo. Permiten reporting + dedupe; null = línea
  // custom no vinculada al catálogo.
  tourId: uuidNullable,
  stayId: uuidNullable,
  transferRouteId: uuidNullable,
});

const createInvoiceManualSchema = z.object({
  customerName: z.string().trim().min(1, "Nombre del cliente requerido").max(200),
  customerEmail: z
    .string()
    .trim()
    .email("Email del cliente inválido")
    .max(200),
  customerPhone: z.string().trim().max(40).optional().or(z.literal("")),
  customerWhatsapp: z.string().trim().max(40).optional().or(z.literal("")),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  dueAt: z
    .string()
    .trim()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha de vencimiento inválida (YYYY-MM-DD)")
    .optional()
    .or(z.literal("")),
  items: z.array(lineItemSchema).min(1, "Agregá al menos un ítem a la factura"),
  // Si está poblado, asociamos la invoice a ese profile. Si está vacío, la
  // invoice queda atada al admin actor (customer info por campos sueltos).
  userId: uuidNullable,
});

function firstZodError(err: { errors: { message: string }[] }): string {
  return err.errors[0]?.message ?? "Datos inválidos";
}

// ===========================================================================
// QUERIES
// ===========================================================================

/**
 * Lista facturas. Staff ve todas; el usuario solo las suyas (vía RLS).
 */
export async function listInvoices(): Promise<InvoiceRow[]> {
  const guard = await getStaffWithPermissionOrError("invoices:read");
  if (!guard.ok) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoices")
    .select("*, items:invoice_items(*)")
    .order("issued_at", { ascending: false });

  if (error) {
    console.error("[listInvoices]", error.message);
    return [];
  }
  return (data ?? []) as InvoiceRow[];
}

// ===========================================================================
// MARK INVOICE PAID
// ===========================================================================
// Pivote 2026-06-04: se eliminó `createInvoiceFromBookings` (atado al
// cart-checkout obsoleto). Fase 2 reescribirá la creación de invoices con
// Stripe Payment Link generado server-side. `markInvoicePaid` y
// `markInvoicesPaidForBooking` se mantienen para soporte manual del admin.

/**
 * Marca una factura como pagada. Solo staff. Usado tras confirmPayment para
 * cerrar el ciclo Service → Payment → Invoice.
 */
export async function markInvoicePaid(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffWithPermissionOrError("invoices:write");
  if (!guard.ok) return guard;

  const id = String(formData.get("id") ?? "").trim();
  const paymentRef = String(formData.get("paymentRef") ?? "").trim();
  if (!id) return { ok: false, error: "ID requerido" };

  const supabase = await createClient();
  const actorId = guard.current.user.id;

  const { error } = await supabase
    .from("invoices")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      ...(paymentRef ? { payment_ref: paymentRef } : {}),
    })
    .eq("id", id);

  if (error) {
    return { ok: false, error: `No se pudo marcar como pagada: ${error.message}` };
  }

  await writeAuditLog(actorId, "invoice.paid", "invoice", id, { paymentRef });
  return { ok: true };
}

/**
 * Marca como pagadas las facturas que tienen items relacionados al booking_id
 * dado. Usado desde confirmPayment para mantener Service→Payment→Invoice
 * en sincronía: cuando el admin confirma un pago de una reserva, todas las
 * facturas que contengan esa reserva pasan a 'paid' automaticamente.
 */
export async function markInvoicesPaidForBooking(
  formData: FormData
): Promise<ActionResult<{ invoicesUpdated: number }>> {
  const guard = await getStaffWithPermissionOrError("invoices:write");
  if (!guard.ok) return guard;

  const bookingId = String(formData.get("bookingId") ?? "").trim();
  if (!bookingId) return { ok: false, error: "bookingId requerido" };

  const supabase = await createClient();

  // Buscar invoice_ids vinculadas al booking.
  const { data: items, error: itErr } = await supabase
    .from("invoice_items")
    .select("invoice_id")
    .eq("booking_id", bookingId);

  if (itErr) {
    return { ok: false, error: `No se pudieron buscar facturas: ${itErr.message}` };
  }
  const invoiceIds = Array.from(
    new Set((items ?? []).map((i) => i.invoice_id).filter(Boolean))
  );
  if (invoiceIds.length === 0) {
    return { ok: true, data: { invoicesUpdated: 0 } };
  }

  const { error: upErr, count } = await supabase
    .from("invoices")
    .update({ status: "paid", paid_at: new Date().toISOString() }, { count: "exact" })
    .in("id", invoiceIds)
    .neq("status", "paid");

  if (upErr) {
    return { ok: false, error: `No se pudo actualizar facturas: ${upErr.message}` };
  }

  return { ok: true, data: { invoicesUpdated: count ?? 0 } };
}

// ===========================================================================
// CREATE INVOICE MANUAL (Pivote 2026-06-04)
// ===========================================================================

/**
 * Crea una factura manual desde el panel admin (modelo catálogo+referral).
 * Flujo:
 *   1. Validar inputs.
 *   2. Generar número INV-YYYY-### (idempotente por año vía count).
 *   3. Insert invoices (status 'draft', user_id = admin actor por ahora;
 *      no asociamos a cliente Supabase porque el cliente puede no tener
 *      cuenta — la factura referencia al cliente por email/whatsapp).
 *   4. Insert invoice_items.
 *   5. Si STRIPE_SECRET_KEY está configurada, crear Product + Price +
 *      Payment Link y guardar stripe_payment_link_url + id. Cambiar status
 *      a 'pending'.
 *   6. Audit log.
 *
 * Si Stripe falla, la invoice queda en 'draft' con error reportado pero
 * persistida; el admin puede reintentar o pegar manualmente el link.
 */
export async function createInvoiceManual(
  formData: FormData
): Promise<
  ActionResult<{
    invoiceId: string;
    number: string;
    stripePaymentLinkUrl: string | null;
    stripeError: string | null;
  }>
> {
  const guard = await getStaffWithPermissionOrError("invoices:write");
  if (!guard.ok) return guard;
  const actorId = guard.current.user.id;

  // El form trae los items como JSON serializado (más simple que entries
  // duplicadas y se valida en un solo paso con zod).
  const itemsRaw = String(formData.get("items") ?? "");
  let itemsInput: unknown = [];
  try {
    itemsInput = itemsRaw ? JSON.parse(itemsRaw) : [];
  } catch {
    return { ok: false, error: "Formato de líneas inválido" };
  }

  const parsed = createInvoiceManualSchema.safeParse({
    customerName: formData.get("customerName") ?? "",
    customerEmail: formData.get("customerEmail") ?? "",
    customerPhone: formData.get("customerPhone") ?? "",
    customerWhatsapp: formData.get("customerWhatsapp") ?? "",
    notes: formData.get("notes") ?? "",
    dueAt: formData.get("dueAt") ?? "",
    items: itemsInput,
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }
  const d = parsed.data;

  const supabase = await createClient();

  // Generar número via count del año actual (admin client para no depender de
  // RLS de SELECT del actor; staff puede leer pero el admin client es más
  // estable si rotamos permisos).
  const year = new Date().getFullYear();
  const admin = createAdminClient();
  const { count } = await admin
    .from("invoices")
    .select("id", { count: "exact", head: true })
    .gte("issued_at", `${year}-01-01`)
    .lte("issued_at", `${year}-12-31`);
  const nextNum = (count ?? 0) + 1;
  const number = `INV-${year}-${String(nextNum).padStart(3, "0")}`;

  const subtotalCents = d.items.reduce(
    (acc, it) => acc + it.unitCents * it.quantity,
    0
  );
  const totalCents = subtotalCents; // sin tax/discount por ahora

  // Insert invoice — user_id apunta al admin que crea (el cliente puede no
  // tener perfil en profiles). RLS permite a staff insertar.
  // user_id: el del cliente si está poblado; sino el actor (admin) como
  // fallback para que la invoice tenga FK válida. Esto permite que el
  // cliente vea sus invoices en /account → Mis Facturas vía RLS.
  const invoiceUserId = (d.userId && d.userId.length > 0) ? d.userId : actorId;
  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      number,
      user_id: invoiceUserId,
      customer_name: d.customerName,
      customer_email: d.customerEmail,
      customer_phone: d.customerPhone || null,
      customer_whatsapp: d.customerWhatsapp || d.customerPhone || null,
      subtotal_cents: subtotalCents,
      total_cents: totalCents,
      due_at: d.dueAt || null,
      notes: d.notes || null,
      status: "draft",
    })
    .select("id, number")
    .single();

  if (invErr || !invoice) {
    return {
      ok: false,
      error: `No se pudo crear la factura: ${invErr?.message ?? "desconocido"}`,
    };
  }

  // Insert items con FKs al catálogo (cuando aplicable).
  const itemsPayload = d.items.map((it) => ({
    invoice_id: invoice.id,
    description: it.description,
    quantity: it.quantity,
    unit_cents: it.unitCents,
    line_total_cents: it.unitCents * it.quantity,
    tour_id: it.tourId || null,
    stay_id: it.stayId || null,
    transfer_route_id: it.transferRouteId || null,
  }));
  const { error: itErr } = await supabase
    .from("invoice_items")
    .insert(itemsPayload);
  if (itErr) {
    await supabase.from("invoices").delete().eq("id", invoice.id);
    return {
      ok: false,
      error: `No se pudo crear los items: ${itErr.message}`,
    };
  }

  // Crear Stripe Payment Link si la SDK está configurada. No-bloqueante: si
  // falla, dejamos la invoice en 'draft' y reportamos el error al admin para
  // que reintente desde el UI.
  let stripePaymentLinkUrl: string | null = null;
  let stripeError: string | null = null;

  if (isStripeConfigured()) {
    try {
      const stripe = getStripe();
      // Product + Price inline (un solo line item con el total agregado).
      // Si querés desglosar por línea en Stripe, habría que crear N prices y
      // pasarlos como line_items[]; por ahora un único line item con la
      // descripción "Factura {number}" es suficiente para el cobro.
      const price = await stripe.prices.create({
        currency: "usd",
        unit_amount: totalCents,
        product_data: {
          name: `Factura ${number} — ${d.customerName}`,
        },
      });
      const link = await stripe.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: {
          invoice_id: invoice.id,
          invoice_number: number,
        },
      });
      stripePaymentLinkUrl = link.url;

      // Persistir + promover a 'pending' (esperando pago del cliente).
      await supabase
        .from("invoices")
        .update({
          stripe_payment_link_url: link.url,
          stripe_payment_link_id: link.id,
          status: "pending",
        })
        .eq("id", invoice.id);
    } catch (e) {
      stripeError = e instanceof Error ? e.message : String(e);
      console.warn("[createInvoiceManual] Stripe Payment Link failed:", e);
    }
  } else {
    stripeError =
      "Stripe no está configurado en el servidor. La factura quedó en borrador.";
  }

  await writeAuditLog(actorId, "invoice.create_manual", "invoice", invoice.id, {
    number,
    total_cents: totalCents,
    items: d.items.length,
    stripe_ok: stripePaymentLinkUrl !== null,
  });

  return {
    ok: true,
    data: {
      invoiceId: invoice.id,
      number: invoice.number,
      stripePaymentLinkUrl,
      stripeError,
    },
  };
}

// ===========================================================================
// REGENERATE STRIPE PAYMENT LINK
// ===========================================================================

/**
 * Reintenta crear (o regenera) el Stripe Payment Link para una invoice que
 * quedó en 'draft' o que tuvo error de Stripe en su creación. También útil
 * si el admin cambia el total de la factura (no implementado todavía: la
 * edición de invoice/items requiere otra acción).
 */
export async function regenerateStripePaymentLink(
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  const guard = await getStaffWithPermissionOrError("invoices:write");
  if (!guard.ok) return guard;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "ID requerido" };

  if (!isStripeConfigured()) {
    return {
      ok: false,
      error: "Stripe no está configurado en el servidor.",
    };
  }

  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("invoices")
    .select("id, number, customer_name, total_cents, status")
    .eq("id", id)
    .maybeSingle();

  if (!inv) return { ok: false, error: "Factura no encontrada" };
  if (inv.status === "paid") {
    return { ok: false, error: "La factura ya está pagada." };
  }

  try {
    const stripe = getStripe();
    const price = await stripe.prices.create({
      currency: "usd",
      unit_amount: inv.total_cents,
      product_data: { name: `Factura ${inv.number} — ${inv.customer_name}` },
    });
    const link = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: { invoice_id: inv.id, invoice_number: inv.number },
    });
    await supabase
      .from("invoices")
      .update({
        stripe_payment_link_url: link.url,
        stripe_payment_link_id: link.id,
        status: inv.status === "draft" ? "pending" : inv.status,
      })
      .eq("id", id);
    return { ok: true, data: { url: link.url } };
  } catch (e) {
    return {
      ok: false,
      error: `Stripe falló: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

// ===========================================================================
// GENERATE INVOICE PDF
// ===========================================================================

/**
 * Renderiza el PDF de la factura, lo sube al bucket privado `invoice-pdfs`
 * (path: `<invoiceId>/<number>.pdf`), genera una signed URL con TTL de 7
 * días y la persiste en `invoices.pdf_url`. Si el PDF ya existe lo
 * sobrescribe (admin puede regenerar tras editar la invoice).
 *
 * Devuelve la signed URL para que el caller pueda descargar inmediatamente.
 * Llamadas posteriores re-generan una nueva signed URL (no se cachea para
 * evitar links expirados).
 */
export async function generateInvoicePdf(
  formData: FormData
): Promise<ActionResult<{ pdfUrl: string }>> {
  const guard = await getStaffWithPermissionOrError("invoices:write");
  if (!guard.ok) return guard;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "ID requerido" };

  const supabase = await createClient();
  const { data: invRaw, error: fetchErr } = await supabase
    .from("invoices")
    .select("*, items:invoice_items(*)")
    .eq("id", id)
    .maybeSingle();

  if (fetchErr || !invRaw) {
    return { ok: false, error: "Factura no encontrada" };
  }
  const invoice = invRaw as InvoiceForPdf;

  // Render PDF en memoria.
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await renderInvoicePdf(invoice);
  } catch (e) {
    return {
      ok: false,
      error: `No se pudo renderizar el PDF: ${e instanceof Error ? e.message : String(e)}`,
    };
  }

  // Subir a Storage. Usamos admin client porque las policies del bucket
  // exigen fn_is_staff(); el server-side client de Supabase puede no
  // resolver el JWT correctamente para Storage. Admin client bypasea RLS.
  const admin = createAdminClient();
  const path = `${invoice.id}/${invoice.number}.pdf`;
  const { error: upErr } = await admin.storage
    .from(PDF_BUCKET)
    .upload(path, pdfBuffer, {
      contentType: "application/pdf",
      upsert: true,
    });
  if (upErr) {
    return {
      ok: false,
      error: `No se pudo subir el PDF: ${upErr.message}`,
    };
  }

  // Signed URL (privada con TTL).
  const { data: signed, error: signErr } = await admin.storage
    .from(PDF_BUCKET)
    .createSignedUrl(path, PDF_SIGNED_URL_TTL_SEC);
  if (signErr || !signed) {
    return {
      ok: false,
      error: `No se pudo firmar la URL del PDF: ${signErr?.message ?? "desconocido"}`,
    };
  }

  await supabase
    .from("invoices")
    .update({ pdf_url: signed.signedUrl })
    .eq("id", id);

  return { ok: true, data: { pdfUrl: signed.signedUrl } };
}

// ===========================================================================
// GET WHATSAPP LINK FOR INVOICE
// ===========================================================================

/**
 * Construye el wa.me URL con un mensaje pre-llenado para enviar la factura
 * al cliente por WhatsApp. El admin abre la URL, WhatsApp abre con el mensaje
 * cargado, y el admin adjunta el PDF manualmente (Fase 2 MVP: send manual).
 *
 * Si `customer_whatsapp` no está, usamos `customer_phone`. Si ninguno existe,
 * devolvemos solo el text (sin número) para que el admin lo copie y pegue.
 */
export async function getInvoiceWhatsAppLink(
  formData: FormData
): Promise<ActionResult<{ url: string; phone: string | null }>> {
  const guard = await getStaffWithPermissionOrError("invoices:read");
  if (!guard.ok) return guard;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "ID requerido" };

  const supabase = await createClient();
  const { data: inv } = await supabase
    .from("invoices")
    .select(
      "number, customer_name, customer_phone, customer_whatsapp, total_cents, stripe_payment_link_url, pdf_url"
    )
    .eq("id", id)
    .maybeSingle();

  if (!inv) return { ok: false, error: "Factura no encontrada" };

  const phone = (inv.customer_whatsapp || inv.customer_phone || "")
    .replace(/\D/g, "");

  const totalUsd = (inv.total_cents / 100).toFixed(2);
  const lines = [
    `Hola ${inv.customer_name},`,
    "",
    `Te compartimos la factura ${inv.number} por un total de $${totalUsd} USD.`,
  ];
  if (inv.stripe_payment_link_url) {
    lines.push("", `Podés pagarla acá: ${inv.stripe_payment_link_url}`);
  }
  if (inv.pdf_url) {
    lines.push("", `PDF de la factura: ${inv.pdf_url}`);
  }
  lines.push("", "Cualquier consulta, respondemos por este mismo chat.");
  lines.push("— PRDISE");

  const text = encodeURIComponent(lines.join("\n"));
  const url = phone
    ? `https://wa.me/${phone}?text=${text}`
    : `https://wa.me/?text=${text}`;

  return { ok: true, data: { url, phone: phone || null } };
}

// ===========================================================================
// SEARCH PROFILES (autocomplete del modal de invoice)
// ===========================================================================

export type ProfileSearchResult = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
};

/**
 * Busca profiles por email (auth.users), nombre o teléfono. Devuelve hasta
 * 10 matches. Solo admin (datos personales sensibles).
 *
 * El email vive en auth.users; lo cruzamos via admin client. La búsqueda
 * en profiles es por first_name/last_name/phone con ilike.
 */
export async function searchProfiles(
  formData: FormData
): Promise<ActionResult<{ results: ProfileSearchResult[] }>> {
  const guard = await getStaffWithPermissionOrError("users:read");
  if (!guard.ok) return guard;

  const q = String(formData.get("q") ?? "").trim();
  if (!q || q.length < 2) {
    return { ok: true, data: { results: [] } };
  }

  const admin = createAdminClient();

  // Trae auth.users (con email) y profiles, cruza, filtra.
  const { data: auth, error: authErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (authErr) {
    return { ok: false, error: `No se pudo buscar usuarios: ${authErr.message}` };
  }

  const pattern = `%${q}%`;
  const { data: profiles, error: profErr } = await admin
    .from("profiles")
    .select("id, first_name, last_name, phone")
    .or(`first_name.ilike.${pattern},last_name.ilike.${pattern},phone.ilike.${pattern}`)
    .limit(30);

  if (profErr) {
    return { ok: false, error: `No se pudo buscar profiles: ${profErr.message}` };
  }

  // Combinamos: matches por nombre/phone + matches por email.
  const emailMatches = auth.users.filter((u) =>
    (u.email || "").toLowerCase().includes(q.toLowerCase())
  );
  const byId = new Map<string, ProfileSearchResult>();
  for (const u of emailMatches) {
    byId.set(u.id, {
      id: u.id,
      email: u.email || null,
      first_name: null,
      last_name: null,
      phone: null,
    });
  }
  for (const p of profiles ?? []) {
    const authUser = auth.users.find((u) => u.id === p.id);
    const existing = byId.get(p.id);
    byId.set(p.id, {
      id: p.id,
      email: authUser?.email || existing?.email || null,
      first_name: p.first_name,
      last_name: p.last_name,
      phone: p.phone,
    });
  }
  // Para emailMatches que no tuvieron profile, intentamos enriquecer ahora.
  for (const u of emailMatches) {
    if (byId.get(u.id)?.first_name) continue;
    const { data: profile } = await admin
      .from("profiles")
      .select("first_name, last_name, phone")
      .eq("id", u.id)
      .maybeSingle();
    if (profile) {
      const existing = byId.get(u.id)!;
      byId.set(u.id, { ...existing, ...profile });
    }
  }

  const results = Array.from(byId.values()).slice(0, 10);
  return { ok: true, data: { results } };
}

// ===========================================================================
// CREATE CUSTOMER FOR INVOICE
// ===========================================================================

/**
 * Crea un cliente nuevo (auth.users + profile) cuando el admin lo necesita
 * para emitir una invoice. Email confirmado automáticamente (el cliente no
 * tiene que verificar nada). Password aleatorio que se devuelve UNA SOLA VEZ
 * al admin para que lo envíe al cliente por WhatsApp.
 *
 * Idempotente: si el email ya existe, devuelve el user_id sin tocar la
 * password (no la expone tampoco). El admin puede usar Auth Tools si
 * necesita resetear el password.
 */
const createCustomerSchema = z.object({
  email: z.string().trim().email("Email inválido").max(200),
  firstName: z.string().trim().min(1).max(80).optional().or(z.literal("")),
  lastName: z.string().trim().min(1).max(80).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
});

function randomPassword(): string {
  const chars = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let p = "";
  const len = 14;
  // Usamos crypto.getRandomValues en runtime Node 19+/web.
  const arr = new Uint32Array(len);
  globalThis.crypto.getRandomValues(arr);
  for (let i = 0; i < len; i++) p += chars[arr[i] % chars.length];
  return p + "!2"; // garantiza un símbolo + dígitos (política Supabase default)
}

export async function createCustomerForInvoice(
  formData: FormData
): Promise<
  ActionResult<{
    userId: string;
    email: string;
    password: string | null;
    isNew: boolean;
  }>
> {
  const guard = await getStaffWithPermissionOrError("invoices:write");
  if (!guard.ok) return guard;

  const parsed = createCustomerSchema.safeParse({
    email: formData.get("email"),
    firstName: formData.get("firstName"),
    lastName: formData.get("lastName"),
    phone: formData.get("phone"),
  });
  if (!parsed.success) {
    return { ok: false, error: firstZodError(parsed.error) };
  }
  const { email, firstName, lastName, phone } = parsed.data;
  const emailLower = email.toLowerCase();

  const admin = createAdminClient();

  // Lookup primero.
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const existing = list?.users.find((u) => (u.email || "").toLowerCase() === emailLower);
  if (existing) {
    // Asegurar profile poblado (idempotente).
    await admin
      .from("profiles")
      .update({
        ...(firstName ? { first_name: firstName } : {}),
        ...(lastName ? { last_name: lastName } : {}),
        ...(phone ? { phone } : {}),
      })
      .eq("id", existing.id);
    return {
      ok: true,
      data: { userId: existing.id, email: emailLower, password: null, isNew: false },
    };
  }

  // Crear nuevo.
  const password = randomPassword();
  const { data: newUser, error: createErr } = await admin.auth.admin.createUser({
    email: emailLower,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: firstName || null,
      last_name: lastName || null,
      phone: phone || null,
    },
  });
  if (createErr || !newUser?.user) {
    return { ok: false, error: `No se pudo crear el cliente: ${createErr?.message ?? "desconocido"}` };
  }

  // Update profile con phone (el trigger ya creó la fila con first/last).
  if (phone) {
    await admin.from("profiles").update({ phone }).eq("id", newUser.user.id);
  }

  await writeAuditLog(guard.current.user.id, "customer.create", "profile", newUser.user.id, {
    email: emailLower,
  });

  return {
    ok: true,
    data: { userId: newUser.user.id, email: emailLower, password, isNew: true },
  };
}

// ===========================================================================
// FIND RECENT DUPLICATES
// ===========================================================================

/**
 * Detecta invoices recientes (últimos 30 días, status draft/pending) del
 * mismo cliente que incluyan algún tour/stay/transfer en común. Útil para
 * advertir al admin antes de generar una invoice duplicada accidentalmente.
 */
const dedupeSchema = z.object({
  userId: z.string().uuid(),
  tourIds: z.array(z.string().uuid()).default([]),
  stayIds: z.array(z.string().uuid()).default([]),
  transferRouteIds: z.array(z.string().uuid()).default([]),
});

export type DuplicateMatch = {
  invoiceId: string;
  number: string;
  status: string;
  totalCents: number;
  createdAt: string;
  matchedServices: string[]; // descripciones que matchean
};

export async function findRecentDuplicates(
  formData: FormData
): Promise<ActionResult<{ matches: DuplicateMatch[] }>> {
  const guard = await getStaffWithPermissionOrError("invoices:read");
  if (!guard.ok) return guard;

  const raw = String(formData.get("payload") ?? "{}");
  let payload: unknown;
  try { payload = JSON.parse(raw); } catch { return { ok: false, error: "payload inválido" }; }
  const parsed = dedupeSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };
  const { userId, tourIds, stayIds, transferRouteIds } = parsed.data;
  if (tourIds.length + stayIds.length + transferRouteIds.length === 0) {
    return { ok: true, data: { matches: [] } };
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const supabase = await createClient();

  // Buscamos invoices del user en últimos 30d con status draft/pending,
  // que tengan al menos 1 item con FK match. Hacemos un SELECT con join.
  const { data, error } = await supabase
    .from("invoices")
    .select("id, number, status, total_cents, created_at, items:invoice_items(description, tour_id, stay_id, transfer_route_id)")
    .eq("user_id", userId)
    .in("status", ["draft", "pending"])
    .gte("created_at", since)
    .order("created_at", { ascending: false });

  if (error) return { ok: false, error: `Búsqueda falló: ${error.message}` };

  type ItemRow = { description: string; tour_id: string | null; stay_id: string | null; transfer_route_id: string | null };
  const matches: DuplicateMatch[] = [];
  for (const inv of data ?? []) {
    const items = (inv.items as ItemRow[] | null) ?? [];
    const matched: string[] = [];
    for (const it of items) {
      if (it.tour_id && tourIds.includes(it.tour_id)) matched.push(it.description);
      else if (it.stay_id && stayIds.includes(it.stay_id)) matched.push(it.description);
      else if (it.transfer_route_id && transferRouteIds.includes(it.transfer_route_id)) matched.push(it.description);
    }
    if (matched.length > 0) {
      matches.push({
        invoiceId: inv.id,
        number: inv.number,
        status: inv.status,
        totalCents: inv.total_cents,
        createdAt: inv.created_at,
        matchedServices: matched,
      });
    }
  }

  return { ok: true, data: { matches } };
}
