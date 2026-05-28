"use client";

import { useEffect } from "react";
import WelcomeSplash from "@/components/WelcomeSplash";

/**
 * Stub: el panel admin real vive embebido en el JSX monolítico
 * (PrdiseApp.jsx) bajo la ruta hash `#/admin`. Server Actions con
 * `requireStaffOrRedirect` pueden redirigir a `/admin` (path Next.js);
 * sin este stub el browser recibe 404. Acá redirigimos al hash route
 * donde el JSX monta `AdminPanelRoute`. Mostramos WelcomeSplash mientras
 * sucede el redirect para evitar pantalla en blanco entre navegaciones.
 */
export default function AdminRedirect() {
  useEffect(() => {
    window.location.replace("/#/admin");
  }, []);
  return <WelcomeSplash />;
}
