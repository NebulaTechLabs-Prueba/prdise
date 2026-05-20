"use client";

import { useEffect } from "react";

/**
 * Stub: el listado de tours vive embebido en el JSX monolítico
 * (PrdiseApp.jsx) bajo la ruta hash `#/tours`. Sin este stub Next.js
 * devuelve 404 cuando se navega a `/tours`. Redirigimos al hash route
 * donde el JSX monta `ToursList`.
 */
export default function ToursRedirect() {
  useEffect(() => {
    window.location.replace("/#/tours");
  }, []);
  return null;
}
