"use server";

import { createClient } from "@/lib/supabase/server";
import { getStaffOrError } from "./_shared";

export type WebhookLogRow = {
  id: string;
  provider: string;
  event_type: string | null;
  event_id: string | null;
  status_code: number;
  outcome: string;
  message: string | null;
  payload_snippet: string | null;
  invoice_id: string | null;
  received_at: string;
};

/**
 * PM 2026-07-02: lista los últimos intentos del webhook (Stripe / PayPal)
 * para diagnóstico. Solo admin/staff. Devuelve máximo 100 rows más
 * recientes. Si la tabla no existe todavía (migración no aplicada),
 * devuelve [] en lugar de tirar.
 */
export async function listWebhookLogs(
  limit = 50
): Promise<WebhookLogRow[]> {
  const guard = await getStaffOrError();
  if (!guard.ok) return [];

  const supabase = await createClient();
  // Cast a never: la tabla existe post-migración 20260702180000 pero los
  // types generados no la incluyen hasta regenerar. Fallback: si no
  // existe, el error 42P01 nos lo dice y devolvemos [].
  const { data, error } = await (supabase as unknown as {
    from: (t: string) => {
      select: (cols: string) => {
        order: (col: string, opts: { ascending: boolean }) => {
          limit: (n: number) => Promise<{ data: unknown[] | null; error: { message: string } | null }>;
        };
      };
    };
  })
    .from("webhook_event_log")
    .select(
      "id, provider, event_type, event_id, status_code, outcome, message, payload_snippet, invoice_id, received_at"
    )
    .order("received_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 100));

  if (error) {
    console.warn("[listWebhookLogs]", error.message);
    return [];
  }
  return (data ?? []) as WebhookLogRow[];
}
