"use client";

import { useEffect } from "react";
import WelcomeSplash from "@/components/WelcomeSplash";

/**
 * Stub: la página de login real vive embebida en el JSX monolítico
 * (PrdiseApp.jsx) bajo la ruta hash `#/login`. Server Actions como
 * `requireAuth` redirigen a `/login` (path Next.js), y sin este stub
 * el browser recibe 404. Acá redirigimos al hash route donde el JSX
 * monta `LoginPage`.
 */
export default function LoginRedirect() {
  useEffect(() => {
    window.location.replace("/#/login");
  }, []);
  return <WelcomeSplash />;
}
