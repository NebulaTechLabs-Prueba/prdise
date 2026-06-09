"use client";

import { useEffect } from "react";

/**
 * Stub: la Política de Privacidad vive en PrdiseApp.jsx bajo `#/privacy`
 * (componente LegalPage kind="privacy"). Este stub redirige para que
 * `/privacy` directo no devuelva 404.
 */
export default function PrivacyRedirect() {
  useEffect(() => {
    window.location.replace("/#/privacy");
  }, []);
  return null;
}
