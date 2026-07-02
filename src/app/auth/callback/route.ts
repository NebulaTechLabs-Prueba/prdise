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
  const rawNext = searchParams.get("next") ?? "/";
  // PM 2026-06-18: validar que next sea path relativo. `//attacker.com` y
  // `https://attacker.com` son redirects abiertos que permitirían secuestro
  // de sesión post-auth.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";
  const type = searchParams.get("type");

  if (code) {
    const supabase = await createClient();
    const { data: exchangeData, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // PM 2026-06-29: gate de mantenimiento — si el sitio está en modo
      // mantenimiento y el usuario no es admin, cerramos la sesión recién
      // creada y volvemos al home con un flag para que la UI muestre por
      // qué. Evita que un no-admin pueda entrar vía OAuth (Google) o
      // magic-link mientras el sitio está pausado.
      const uid = exchangeData?.user?.id;
      if (uid && type !== "recovery") {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", uid)
          .maybeSingle();
        const role = (profile?.role ?? "user") as "admin" | "user";
        if (role !== "admin") {
          const { data: mset } = await supabase
            .from("site_settings")
            .select("value")
            .eq("key", "site_maintenance_mode")
            .maybeSingle();
          const maintenance = String(mset?.value ?? "false").toLowerCase() === "true";
          if (maintenance) {
            await supabase.auth.signOut();
            return NextResponse.redirect(`${publicOrigin}/?maintenance=1`);
          }
        }
      }
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
