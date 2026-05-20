"use client";

import { useEffect } from "react";

/**
 * Stub: el listado de stays vive embebido en el JSX monolítico
 * (PrdiseApp.jsx) bajo la ruta hash `#/stays`. Sin este stub Next.js
 * devuelve 404 cuando se navega a `/stays`. Redirigimos al hash route
 * donde el JSX monta `HotelsList`.
 */
export default function StaysRedirect() {
  useEffect(() => {
    window.location.replace("/#/stays");
  }, []);
  return null;
}
