"use client";

import { useEffect } from "react";

/**
 * Stub: el blog vive embebido en el JSX monolítico (PrdiseApp.jsx) bajo
 * la ruta hash `#/blog`. Sin este stub Next.js devuelve 404 cuando se
 * navega a `/blog`. Redirigimos al hash route donde el JSX monta
 * `BlogArchive`.
 */
export default function BlogRedirect() {
  useEffect(() => {
    window.location.replace("/#/blog");
  }, []);
  return null;
}
