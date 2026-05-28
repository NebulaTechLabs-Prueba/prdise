"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import WelcomeSplash from "./WelcomeSplash";

const PrdiseApp = dynamic(() => import("./PrdiseApp"), {
  ssr: false,
  loading: () => <WelcomeSplash />,
});

/**
 * Intercepta los hash params de Supabase Auth (implicit flow). Cuando un
 * email link de tipo `recovery` redirige al sitio, Supabase pega tokens
 * en el fragmento (#access_token=...&type=recovery&...). Si el usuario cae
 * en la raíz, el hash router del JSX lo interpreta como una ruta y muestra
 * un 404. Acá detectamos el flujo y movemos al path correcto preservando
 * el fragmento para que el cliente Supabase lo consuma.
 */
function getRecoveryTarget(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash.includes("access_token=") || !hash.includes("type=recovery")) {
    return null;
  }
  if (window.location.pathname.startsWith("/auth/reset-password")) {
    return null;
  }
  return `/auth/reset-password${hash}`;
}

export default function PrdiseAppLoader() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const target = getRecoveryTarget();
    if (target) {
      window.location.replace(target);
      return;
    }
    setReady(true);
  }, []);

  if (!ready) return <WelcomeSplash />;
  return <PrdiseApp />;
}
