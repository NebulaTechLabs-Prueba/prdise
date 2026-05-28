"use client";

import { useEffect } from "react";
import WelcomeSplash from "@/components/WelcomeSplash";

/**
 * Stub: la página de cuenta real vive embebida en el JSX monolítico
 * (PrdiseApp.jsx) bajo la ruta hash `#/account`. Server Actions y enlaces
 * externos pueden apuntar a `/account` (path Next.js); sin este stub el
 * browser recibe 404. Acá redirigimos al hash route donde el JSX monta
 * `AccountPage`. Mostramos WelcomeSplash mientras sucede el redirect para
 * evitar pantalla en blanco entre navegaciones.
 */
export default function AccountRedirect() {
  useEffect(() => {
    window.location.replace("/#/account");
  }, []);
  return <WelcomeSplash />;
}
