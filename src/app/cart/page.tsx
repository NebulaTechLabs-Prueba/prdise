"use client";

import { useEffect } from "react";

/**
 * Stub: el checkout del carrito vive embebido en el JSX monolítico
 * (PrdiseApp.jsx) bajo la ruta hash `#/checkout-cart`. Enlaces externos
 * o redirects post-login pueden apuntar a `/cart`; sin este stub Next.js
 * devuelve 404. Redirigimos al hash route donde el JSX monta
 * `CartCheckoutPage`.
 */
export default function CartRedirect() {
  useEffect(() => {
    window.location.replace("/#/checkout-cart");
  }, []);
  return null;
}
