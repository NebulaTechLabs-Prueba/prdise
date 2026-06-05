/**
 * Lectura pública de `site_settings` (KV de configuración del sitio).
 *
 * RLS: select público — cualquiera (incluso anon) puede leer estas keys
 * porque son datos de contacto + branding visibles en el sitio público.
 * NO almacenar nada sensible en esta tabla.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

export type SettingsMap = Record<string, string>;

/**
 * Devuelve TODOS los settings como un objeto `{ key: value }`. Si la tabla
 * está vacía o la query falla, devuelve `{}` (callers deben usar defaults).
 */
export async function getSiteSettings(
  client: SupabaseClient<Database>
): Promise<SettingsMap> {
  const { data, error } = await client
    .from("site_settings")
    .select("key, value");

  if (error || !data) return {};

  const map: SettingsMap = {};
  for (const row of data) {
    if (row.key) map[row.key] = row.value ?? "";
  }
  return map;
}

/**
 * Helper para obtener una key con default. Útil en componentes que
 * necesitan un valor específico sin pasar todo el map.
 */
export function getSetting(
  settings: SettingsMap | undefined | null,
  key: string,
  fallback: string
): string {
  if (!settings) return fallback;
  const v = settings[key];
  return v && v.trim().length > 0 ? v : fallback;
}
