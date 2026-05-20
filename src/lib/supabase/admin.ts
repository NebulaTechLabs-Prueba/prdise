import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

// Solo para uso en server-side (Server Actions, Route Handlers, jobs admin).
// Bypasea RLS completa. Nunca importar desde código cliente.
export function createAdminClient() {
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}
