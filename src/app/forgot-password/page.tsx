"use client";

import { useEffect } from "react";

/**
 * Stub: la página de recuperación de contraseña vive embebida en el JSX
 * monolítico (PrdiseApp.jsx) bajo la ruta hash `#/forgot-password`. Sin
 * este stub Next.js devuelve 404 cuando los emails de Supabase enlazan a
 * `/forgot-password`. Redirigimos al hash route donde el JSX monta
 * `ForgotPasswordPage`.
 */
export default function ForgotPasswordRedirect() {
  useEffect(() => {
    window.location.replace("/#/forgot-password");
  }, []);
  return null;
}
