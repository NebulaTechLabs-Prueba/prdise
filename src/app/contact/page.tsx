"use client";

import { useEffect } from "react";

/**
 * Stub: la página de contacto vive embebida en el JSX monolítico
 * (PrdiseApp.jsx) bajo la ruta hash `#/contact`. Sin este stub Next.js
 * devuelve 404 cuando se navega a `/contact`. Redirigimos al hash route
 * donde el JSX monta `ContactPage`.
 */
export default function ContactRedirect() {
  useEffect(() => {
    window.location.replace("/#/contact");
  }, []);
  return null;
}
