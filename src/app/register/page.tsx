"use client";

import { useEffect } from "react";

/**
 * Stub: la página de registro real vive embebida en el JSX monolítico
 * (PrdiseApp.jsx) bajo la ruta hash `#/register`. Sin este stub Next.js
 * devuelve 404 cuando se navega a `/register`. Redirigimos al hash route
 * donde el JSX monta `RegisterPage`.
 */
export default function RegisterRedirect() {
  useEffect(() => {
    window.location.replace("/#/register");
  }, []);
  return null;
}
