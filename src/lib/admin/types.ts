import type { Database } from "@/lib/supabase/database.types";

// Tipos compartidos entre Server Actions (que NO pueden exportar types) y
// el código de UI/Server Components que los consume.

type Booking = Database["public"]["Tables"]["bookings"]["Row"];
type Payment = Database["public"]["Tables"]["payments"]["Row"];
type Profile = Database["public"]["Tables"]["profiles"]["Row"];

// ─── Payments ───────────────────────────────────────────────────────────────

export type BookingMini = {
  id: string;
  item_type: Database["public"]["Enums"]["item_type"];
  status: Database["public"]["Enums"]["booking_status"];
  start_date: string;
  end_date: string | null;
  total_cents: number;
  user_id: string;
  stay_id: string | null;
  tour_id: string | null;
  transfer_route_id: string | null;
};

export type CustomerMini = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

export type PendingPaymentRow = Payment & {
  booking: BookingMini | null;
  customer: CustomerMini | null;
  customer_email: string | null;
};

// ─── Bookings ───────────────────────────────────────────────────────────────

export type AdminBookingRow = Booking & {
  customer: CustomerMini | null;
  payments: Payment[];
};

export type ListBookingsResult = {
  items: AdminBookingRow[];
  page: number;
  pageSize: number;
  total: number;
};

// ─── Users ──────────────────────────────────────────────────────────────────

export type AdminUserRow = Profile & {
  email: string | null;
};

export type ListUsersResult = {
  items: AdminUserRow[];
  page: number;
  pageSize: number;
  total: number;
};

// ─── ActionResult genérico ──────────────────────────────────────────────────

export type ActionOk = { ok: true };
export type ActionOkWithData<T> = { ok: true; data: T };
export type ActionError = { ok: false; error: string };
export type ActionResult<T = void> = T extends void
  ? ActionOk | ActionError
  : ActionOkWithData<T> | ActionError;
