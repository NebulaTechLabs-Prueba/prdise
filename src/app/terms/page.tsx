"use client";

import { useEffect } from "react";

/**
 * Stub: la página de Términos y Condiciones vive en PrdiseApp.jsx bajo
 * `#/terms` (componente LegalPage kind="terms"). Este stub redirige al
 * hash route para que `/terms` directo no devuelva 404 (links desde el
 * formulario de registro usan `#/terms` con target=_blank y el browser
 * abre la URL completa).
 */
export default function TermsRedirect() {
  useEffect(() => {
    window.location.replace("/#/terms");
  }, []);
  return null;
}
