"use client";

import { useEffect } from "react";

/**
 * Stub: la página de servicios vive embebida en el JSX monolítico
 * (PrdiseApp.jsx) bajo la ruta hash `#/services`. Sin este stub Next.js
 * devuelve 404 cuando se navega a `/services`. Redirigimos al hash route
 * donde el JSX monta `ServicesPage`.
 */
export default function ServicesRedirect() {
  useEffect(() => {
    window.location.replace("/#/services");
  }, []);
  return null;
}
