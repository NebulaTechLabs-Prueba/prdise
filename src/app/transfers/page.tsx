"use client";

import { useEffect } from "react";

/**
 * Stub: el buscador de transfers vive embebido en el JSX monolítico
 * (PrdiseApp.jsx) bajo la ruta hash `#/transfer-search` (alias
 * `#/transfers`). Sin este stub Next.js devuelve 404 cuando se navega
 * a `/transfers`. Redirigimos al hash route donde el JSX monta
 * `TransferSearchPage`.
 */
export default function TransfersRedirect() {
  useEffect(() => {
    window.location.replace("/#/transfer-search");
  }, []);
  return null;
}
