import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

export type UserRole = Database["public"]["Enums"]["user_role"];
export type Profile = Database["public"]["Tables"]["profiles"]["Row"];

export type CurrentUser = {
  user: {
    id: string;
    email: string | null;
  };
  profile: Profile;
};

/**
 * Retorna el usuario autenticado actual + su profile.
 * Si no hay sesión o no existe el profile, retorna null.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return null;
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return null;
  }

  return {
    user: {
      id: user.id,
      email: user.email ?? null,
    },
    profile,
  };
}

/**
 * Garantiza autenticación. Si no hay sesión, redirige a /login.
 * Retorna { user, profile } cuando hay sesión válida.
 */
export async function requireAuth(): Promise<CurrentUser> {
  const current = await getCurrentUser();
  if (!current) {
    redirect("/login");
  }
  return current;
}

/**
 * Garantiza autenticación + rol dentro del set permitido.
 * Si no cumple, redirige a "/".
 */
export async function requireRole(roles: UserRole[]): Promise<CurrentUser> {
  const current = await requireAuth();
  if (!roles.includes(current.profile.role)) {
    redirect("/");
  }
  return current;
}
