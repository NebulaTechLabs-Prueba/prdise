import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          // Plan A: app sirve sobre HTTP plano. Cookies con flag Secure son
          // descartadas por el browser sobre HTTP. Quitamos `secure` cuando la
          // URL base es HTTP; cuando migremos a HTTPS, el valor original (true)
          // se respeta automáticamente.
          const isHttpOnly = (process.env.NEXT_PUBLIC_APP_URL ?? "").startsWith("http://");
          cookiesToSet.forEach(({ name, value, options }) => {
            const opts = isHttpOnly ? { ...options, secure: false } : options;
            supabaseResponse.cookies.set(name, value, opts);
          });
        },
      },
    }
  );

  // Refresca la sesión en cada request. No borrar sin leer la doc de @supabase/ssr.
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
