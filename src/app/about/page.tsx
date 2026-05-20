"use client";

import { useEffect } from "react";

/**
 * Stub: la página About vive embebida en el JSX monolítico
 * (PrdiseApp.jsx) bajo la ruta hash `#/about`. Sin este stub Next.js
 * devuelve 404 cuando se navega a `/about`. Redirigimos al hash route
 * donde el JSX monta `AboutPage`.
 */
export default function AboutRedirect() {
  useEffect(() => {
    window.location.replace("/#/about");
  }, []);
  return null;
}
