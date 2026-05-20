import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import {
  PERMISSION_AREAS,
  type PermissionArea,
  type PermissionKey,
} from "./constants";

type Client = SupabaseClient<Database>;

export type PermissionRow = {
  key: PermissionKey;
  label_es: string;
  label_en: string;
  description_es: string;
  description_en: string;
  area: PermissionArea;
};

export type PermissionsByArea = Record<PermissionArea, PermissionRow[]>;

/**
 * Retorna el catálogo completo de permisos agrupado por área.
 * El orden de las áreas respeta `PERMISSION_AREAS`.
 */
export async function listAllPermissions(client: Client): Promise<PermissionsByArea> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("permissions")
    .select("key, label_es, label_en, description_es, description_en, area")
    .order("area", { ascending: true })
    .order("key", { ascending: true });

  if (error) {
    throw new Error(`No se pudo cargar el catálogo de permisos: ${error.message}`);
  }

  const grouped = PERMISSION_AREAS.reduce<PermissionsByArea>((acc, area) => {
    acc[area] = [];
    return acc;
  }, {} as PermissionsByArea);

  for (const row of (data ?? []) as PermissionRow[]) {
    if (PERMISSION_AREAS.includes(row.area)) {
      grouped[row.area].push(row);
    }
  }

  return grouped;
}

/**
 * Retorna las keys de permisos asignados a un usuario.
 * No incluye permisos implícitos del admin (admin tiene todo por default).
 */
export async function getUserPermissions(
  client: Client,
  userId: string
): Promise<PermissionKey[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (client as any)
    .from("user_permissions")
    .select("permission_key")
    .eq("user_id", userId);

  if (error) {
    throw new Error(`No se pudieron cargar los permisos del usuario: ${error.message}`);
  }

  return ((data ?? []) as { permission_key: PermissionKey }[]).map(
    (row) => row.permission_key
  );
}

/**
 * Chequea si un usuario tiene un permiso concreto.
 * Para el caller actual (auth.uid()) preferí usar la función SQL
 * `fn_has_permission` directamente; esta versión es útil para chequeos
 * sobre OTROS usuarios desde código admin (Server Actions con service_role).
 *
 * No considera el rol: si el usuario es admin, esto devolverá false a menos
 * que tenga la fila explícita en user_permissions. Para chequeos de
 * autorización efectiva, combina con `profile.role === 'admin'` o usá la RPC.
 */
export async function hasPermission(
  client: Client,
  userId: string,
  permissionKey: PermissionKey
): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count, error } = await (client as any)
    .from("user_permissions")
    .select("permission_key", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("permission_key", permissionKey);

  if (error) {
    throw new Error(`No se pudo verificar el permiso: ${error.message}`);
  }

  return (count ?? 0) > 0;
}
