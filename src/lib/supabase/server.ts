import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            // Plan A: HTTP plano → cookies con Secure no se envían.
            // Forzar secure:false cuando la URL base es http://.
            const isHttpOnly = (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("http://");
            cookiesToSet.forEach(({ name, value, options }) => {
              const opts = isHttpOnly ? { ...options, secure: false } : options;
              cookieStore.set(name, value, opts);
            });
          } catch {
            // Server Components no pueden escribir cookies.
            // Las cookies las setea el middleware.
          }
        },
      },
    }
  );
}
