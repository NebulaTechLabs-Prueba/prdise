"use server";

/**
 * Notificaciones in-app (PM 2026-06-11). El admin las ve al entrar al panel
 * (bell en el header), sin email ni push. Si hay nuevas no leídas, se
 * reproduce un sonido sutil al cargar el panel.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  firstZodError,
  getStaffOrError,
} from "./_shared";
import type { ActionResult } from "./types";
import type { Tables } from "@/lib/supabase/database.types";

export type NotificationRow = Tables<"notifications">;

// PM 2026-06-23: removidos daily_report + overbooking (cliente).
// PM 2026-06-23 (D): "cancellation" removida también — solo se podía
// disparar para bookings y en este modelo de referral los bookings
// nunca se crean desde el público. Cuando exista flujo transaccional
// real se rehabilita el evento.
const KINDS = [
  "new_booking",
  "successful_payment",
  "failed_payment",
  "new_review",
  "new_invoice",
  "new_contact_message",
  // PM 2026-07-02: eventos del ciclo de vida de facturas.
  "invoice_overdue",
  "invoice_cancelled",
  "test",
] as const;

export async function listMyNotifications(): Promise<NotificationRow[]> {
  // Lista las notificaciones del usuario logueado. Devuelve hasta 30 (más
  // que eso = vacío UX-wise; el admin puede marcar todas como leídas).
  const guard = await getStaffOrError();
  if (!guard.ok) return [];

  const supabase = await createClient();
  const userId = guard.current.user.id;

  const { data, error } = await supabase
    .from("notifications")
    .select("*")
    .eq("recipient_id", userId)
    .order("read_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) {
    console.error("[listMyNotifications]", error.message);
    return [];
  }
  return data ?? [];
}

export async function getUnreadCount(): Promise<number> {
  const guard = await getStaffOrError();
  if (!guard.ok) return 0;

  const supabase = await createClient();
  const userId = guard.current.user.id;

  const { count, error } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_id", userId)
    .is("read_at", null);

  if (error) {
    console.error("[getUnreadCount]", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function markNotificationRead(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffOrError();
  if (!guard.ok) return guard;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "ID requerido" };

  const supabase = await createClient();
  const userId = guard.current.user.id;

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_id", userId);

  if (error) return { ok: false, error: `No se pudo marcar: ${error.message}` };
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<ActionResult> {
  const guard = await getStaffOrError();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const userId = guard.current.user.id;

  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", userId)
    .is("read_at", null);

  if (error) return { ok: false, error: `No se pudo marcar: ${error.message}` };
  return { ok: true };
}

export async function deleteNotification(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffOrError();
  if (!guard.ok) return guard;

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false, error: "ID requerido" };

  const supabase = await createClient();
  const userId = guard.current.user.id;

  const { error } = await supabase
    .from("notifications")
    .delete()
    .eq("id", id)
    .eq("recipient_id", userId);

  if (error) return { ok: false, error: `No se pudo eliminar: ${error.message}` };
  return { ok: true };
}

// ─── Test notification (admin-triggered) ───────────────────────────────────
// Botón "Probar" en Configuración → Notificaciones: inserta una entry para
// confirmar que el bell + sonido funcionan correctamente.
export async function createTestNotification(): Promise<ActionResult> {
  const guard = await getStaffOrError();
  if (!guard.ok) return guard;

  const supabase = await createClient();
  const userId = guard.current.user.id;

  const { error } = await supabase.from("notifications").insert({
    recipient_id: userId,
    kind: "test",
    title_es: "Notificación de prueba",
    title_en: "Test notification",
    body_es: "Si ves esto, el sistema de notificaciones funciona.",
    body_en: "If you see this, the notification system is working.",
  });

  if (error) return { ok: false, error: `No se pudo crear: ${error.message}` };
  return { ok: true };
}

// ─── createNotification (server-only helper) ───────────────────────────────
// Pensado para invocarse desde otros server actions cuando ocurra un evento
// (booking, payment, invoice). Por ahora no hay caller automático; lo
// dejamos exportado para hookear desde bookings.ts/invoices.ts en otra
// iteración. Bypasea RLS via admin client porque el actor podría ser otro
// staff distinto del recipient.
const createSchema = z.object({
  recipient_id: z.string().uuid(),
  kind: z.enum(KINDS),
  title_es: z.string().min(1).max(200),
  title_en: z.string().min(1).max(200),
  body_es: z.string().max(2000).optional().nullable(),
  body_en: z.string().max(2000).optional().nullable(),
  link: z.string().max(500).optional().nullable(),
});

export async function createNotificationServer(
  input: z.input<typeof createSchema>
): Promise<ActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("notifications")
    .insert(parsed.data)
    .select("id")
    .single();

  if (error) return { ok: false, error: `No se pudo crear: ${error.message}` };
  return { ok: true, data: { id: data!.id } };
}

// ─── notifyAllAdmins (server-only, NO guard) ───────────────────────────────
// PM 2026-06-23: invocado desde webhooks (Stripe/PayPal) donde NO hay
// sesión humana. Bypasea guard — busca todos los admins activos y emite
// 1 notification por cada uno. Idempotencia no es necesaria; cada evento
// del webhook ya es único (event.id de Stripe / transmission_id de PayPal)
// y los reintentos los maneja el webhook (200/500 → backoff).
const notifyAllSchema = z.object({
  kind: z.enum(KINDS),
  title_es: z.string().min(1).max(200),
  title_en: z.string().min(1).max(200),
  body_es: z.string().max(2000).optional().nullable(),
  body_en: z.string().max(2000).optional().nullable(),
  link: z.string().max(500).optional().nullable(),
});

export async function notifyAllAdmins(
  input: z.input<typeof notifyAllSchema>
): Promise<void> {
  const parsed = notifyAllSchema.safeParse(input);
  if (!parsed.success) {
    console.warn("[notifyAllAdmins] input inválido:", parsed.error.errors[0]?.message);
    return;
  }

  const admin = createAdminClient();
  const { data: admins, error: profErr } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "admin")
    .or("status.is.null,status.eq.active");

  if (profErr || !admins?.length) {
    console.warn("[notifyAllAdmins] no se pudieron listar admins:", profErr?.message);
    return;
  }

  const rows = admins.map((a) => ({
    recipient_id: a.id,
    kind: parsed.data.kind,
    title_es: parsed.data.title_es,
    title_en: parsed.data.title_en,
    body_es: parsed.data.body_es ?? null,
    body_en: parsed.data.body_en ?? null,
    link: parsed.data.link ?? null,
  }));

  const { error } = await admin.from("notifications").insert(rows);
  if (error) console.warn("[notifyAllAdmins] insert fail:", error.message);
}

// ─── Preferences (per-user) ────────────────────────────────────────────────
const prefsSchema = z.object({
  prefs: z.record(z.string(), z.boolean()),
});

export async function saveMyNotificationPrefs(
  formData: FormData
): Promise<ActionResult> {
  const guard = await getStaffOrError();
  if (!guard.ok) return guard;

  const raw = String(formData.get("prefs") ?? "{}");
  let parsedJson: unknown;
  try { parsedJson = JSON.parse(raw); }
  catch { return { ok: false, error: "Formato inválido" }; }

  const parsed = prefsSchema.safeParse({ prefs: parsedJson });
  if (!parsed.success) return { ok: false, error: firstZodError(parsed.error) };

  const supabase = await createClient();
  const userId = guard.current.user.id;

  const { error } = await supabase
    .from("profiles")
    .update({ notification_prefs: parsed.data.prefs as never })
    .eq("id", userId);

  if (error) return { ok: false, error: `No se pudo guardar: ${error.message}` };
  return { ok: true };
}

export async function getMyNotificationPrefs(): Promise<Record<string, boolean>> {
  const guard = await getStaffOrError();
  if (!guard.ok) return {};

  const supabase = await createClient();
  const userId = guard.current.user.id;

  const { data, error } = await supabase
    .from("profiles")
    .select("notification_prefs")
    .eq("id", userId)
    .single();

  if (error || !data?.notification_prefs) return {};
  return data.notification_prefs as Record<string, boolean>;
}
