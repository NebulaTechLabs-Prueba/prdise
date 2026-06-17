import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Endpoint al que Supabase redirige tras confirmar email o magic-link.
// Soporta dos flows:
//   1) PKCE: viene con ?code=... — intercambiamos por sesión server-side.
//   2) Hash (implicit): viene con #access_token=... — el server NO ve el
//      fragmento (no llega al servidor). Redirigimos al destino correcto
//      preservando el hash; el cliente (supabase-js, detectSessionInUrl=true)
//      lo procesa al cargar.
export async function GET(request: NextRequest) {
  // PM 2026-06-17: detrás de Caddy reverse proxy, request.url contiene
  // http://localhost:3000 (la URL interna). Usar el host público vía headers
  // forwarded; si no, caer a NEXT_PUBLIC_APP_URL.
  const fwdHost = request.headers.get("x-forwarded-host");
  const fwdProto = request.headers.get("x-forwarded-proto") || "https";
  const envAppUrl = process.env.NEXT_PUBLIC_APP_URL || "https://livinginprdise.com";
  const publicOrigin = fwdHost ? `${fwdProto}://${fwdHost}` : envAppUrl;

  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";
  const type = searchParams.get("type");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const dest = type === "recovery" ? "/auth/reset-password" : next;
      return NextResponse.redirect(`${publicOrigin}${dest}`);
    }
  }

  // Flow hash (recovery/magiclink/signup): no hay code, los tokens vienen en
  // el fragmento. Redirigimos a home — supabase-js browser detecta el
  // #access_token y crea sesión automáticamente. El navegador preserva el
  // hash durante el 302.
  return NextResponse.redirect(`${publicOrigin}/`);
}
