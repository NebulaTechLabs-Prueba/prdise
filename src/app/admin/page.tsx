"use client";

import { useEffect } from "react";

/**
 * Stub: el panel admin real vive embebido en el JSX monolítico
 * (PrdiseApp.jsx) bajo la ruta hash `#/admin`. Server Actions con
 * `requireStaffOrRedirect` pueden redirigir a `/admin` (path Next.js);
 * sin este stub el browser recibe 404. Acá redirigimos al hash route
 * donde el JSX monta `AdminPanelRoute`.
 */
export default function AdminRedirect() {
  useEffect(() => {
    window.location.replace("/#/admin");
  }, []);
  return null;
}
