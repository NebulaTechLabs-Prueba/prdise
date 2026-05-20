"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

/**
 * Sincroniza la sesión real de Supabase con localStorage para que el JSX
 * monolítico (que lee `prdise_session` / `prdise_user` con su helper PRDISE)
 * siga funcionando sin modificar sus ~50 call sites.
 *
 * - Login → escribe ambas keys en localStorage.
 * - Logout → las borra.
 * - Cambio de sesión externa (otra pestaña) → se refleja en localStorage.
 *
 * NO toca nada visual. NO devuelve markup. Solo efectos.
 */
type SessionShape = {
  email: string;
  role: "admin" | "manager" | "employee" | "user";
  name: string;
  loginAt: string;
  employeeId?: string;
  position?: string;
  department?: string;
};

type UserShape = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  country: string;
  joinedAt: string;
};

function writePrdise(key: string, value: unknown) {
  try {
    localStorage.setItem(`prdise_${key}`, JSON.stringify(value));
  } catch {}
}

function clearPrdise(key: string) {
  try {
    localStorage.removeItem(`prdise_${key}`);
  } catch {}
}

export default function AuthBridge() {
  useEffect(() => {
    const supabase = createClient();

    // CRÍTICO: limpiar agresivamente al startup antes de validar con Supabase.
    // Evita que el JSX lea sesiones viejas del localStorage (demo, expiradas, etc.)
    // y muestre "Booking as Administrator" o similar mientras el async check corre.
    clearPrdise("session");
    clearPrdise("user");
    clearPrdise("adminSession");

    async function syncFromSession() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        clearPrdise("session");
        clearPrdise("user");
        clearPrdise("adminSession");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select(
          "role, status, first_name, last_name, phone, country, employee_id, position, department"
        )
        .eq("id", user.id)
        .maybeSingle();

      if (!profile) {
        clearPrdise("session");
        clearPrdise("user");
        return;
      }

      const fullName = [profile.first_name, profile.last_name]
        .filter(Boolean)
        .join(" ")
        .trim() || user.email || "Usuario";

      const session: SessionShape = {
        email: user.email ?? "",
        role: profile.role,
        name: fullName,
        loginAt: new Date().toISOString(),
        ...(profile.employee_id ? { employeeId: profile.employee_id } : {}),
        ...(profile.position ? { position: profile.position } : {}),
        ...(profile.department ? { department: profile.department } : {}),
      };

      writePrdise("session", session);

      if (profile.role === "admin" || profile.role === "employee" || profile.role === "manager") {
        writePrdise("adminSession", session);
      } else {
        clearPrdise("adminSession");
      }

      const userPayload: UserShape = {
        firstName: profile.first_name ?? "",
        lastName: profile.last_name ?? "",
        email: user.email ?? "",
        phone: profile.phone ?? "",
        country: profile.country ?? "",
        joinedAt: user.created_at
          ? new Date(user.created_at).toLocaleDateString()
          : new Date().toLocaleDateString(),
      };
      writePrdise("user", userPayload);
    }

    // Sync inicial
    syncFromSession();

    // Sync ante cambios (login/logout/refresh)
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        clearPrdise("session");
        clearPrdise("user");
        clearPrdise("adminSession");
      } else {
        syncFromSession();
      }
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  return null;
}
