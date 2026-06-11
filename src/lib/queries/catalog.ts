/**
 * Queries tipadas del catálogo público.
 *
 * Pensadas para usarse desde Server Components o Client Components: el cliente
 * apropiado se pasa como argumento, no se instancia adentro. Esto permite que
 * un mismo helper sirva tanto a `createClient()` de `@/lib/supabase/server`
 * como al de `@/lib/supabase/client`.
 *
 * RLS: las tablas públicas exigen `active = true` para `select` anónimo. Las
 * opciones por defecto respetan esa restricción (`activeOnly = true`).
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/supabase/database.types";

export type CatalogClient = SupabaseClient<Database>;

/* ============================================================================
 * Tipos de opciones
 * ============================================================================ */

export interface StayListOpts {
  activeOnly?: boolean;
  featured?: boolean;
  search?: string;
  limit?: number;
}

export interface TourListOpts {
  activeOnly?: boolean;
  featured?: boolean;
  search?: string;
  limit?: number;
}

export interface TransferRouteListOpts {
  activeOnly?: boolean;
  from?: string;
  to?: string;
}

export interface VehicleListOpts {
  activeOnly?: boolean;
}

export interface PostListOpts {
  featured?: boolean;
  limit?: number;
}

/* ============================================================================
 * Helpers internos
 * ============================================================================ */

/**
 * Aplica un filtro de búsqueda bilingüe sobre los campos `title_es` y
 * `title_en`. Usa `ilike` con `%search%`. No se intenta full-text search en
 * esta primera versión; el chat principal podrá ampliarlo con `tsvector` más
 * adelante si hace falta.
 */
function bilingualSearchFilter(search: string): string {
  const escaped = search.replace(/[%_]/g, (m) => `\\${m}`);
  return `title_es.ilike.%${escaped}%,title_en.ilike.%${escaped}%`;
}

/* ============================================================================
 * Stays
 * ============================================================================ */

export async function getStays(
  client: CatalogClient,
  opts: StayListOpts = {}
): Promise<Tables<"stays">[]> {
  const { activeOnly = true, featured, search, limit } = opts;

  let query = client.from("stays").select("*");

  if (activeOnly) query = query.eq("active", true);
  if (typeof featured === "boolean") query = query.eq("featured", featured);
  if (search && search.trim().length > 0) {
    query = query.or(bilingualSearchFilter(search.trim()));
  }
  query = query.order("featured", { ascending: false }).order("created_at", { ascending: false });
  if (typeof limit === "number" && limit > 0) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getStayBySlug(
  client: CatalogClient,
  slug: string
): Promise<Tables<"stays"> | null> {
  if (!slug) return null;

  const { data, error } = await client
    .from("stays")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/* ============================================================================
 * Tours
 * ============================================================================ */

export async function getTours(
  client: CatalogClient,
  opts: TourListOpts = {}
): Promise<Tables<"tours">[]> {
  const { activeOnly = true, featured, search, limit } = opts;

  let query = client.from("tours").select("*");

  if (activeOnly) query = query.eq("active", true);
  if (typeof featured === "boolean") query = query.eq("featured", featured);
  if (search && search.trim().length > 0) {
    query = query.or(bilingualSearchFilter(search.trim()));
  }
  query = query.order("featured", { ascending: false }).order("created_at", { ascending: false });
  if (typeof limit === "number" && limit > 0) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getTourBySlug(
  client: CatalogClient,
  slug: string
): Promise<Tables<"tours"> | null> {
  if (!slug) return null;

  const { data, error } = await client
    .from("tours")
    .select("*")
    .eq("slug", slug)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/* ============================================================================
 * Transfer routes
 * ============================================================================ */

export async function getTransferRoutes(
  client: CatalogClient,
  opts: TransferRouteListOpts = {}
): Promise<Tables<"transfer_routes">[]> {
  const { activeOnly = true, from, to } = opts;

  let query = client.from("transfer_routes").select("*");

  if (activeOnly) query = query.eq("active", true);
  if (from && from.trim().length > 0) {
    query = query.ilike("from_location", `%${from.trim()}%`);
  }
  if (to && to.trim().length > 0) {
    query = query.ilike("to_location", `%${to.trim()}%`);
  }
  query = query.order("from_location", { ascending: true });

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/* ============================================================================
 * Transfer locations (puntos pickup/dropoff editables — PM 2026-06-11)
 * ============================================================================ */

export async function getTransferLocations(
  client: CatalogClient
): Promise<Tables<"transfer_locations">[]> {
  const { data, error } = await client
    .from("transfer_locations")
    .select("*")
    .eq("active", true)
    .order("sort_order", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

/* ============================================================================
 * Vehicles
 * ============================================================================ */

export async function getVehicles(
  client: CatalogClient,
  opts: VehicleListOpts = {}
): Promise<Tables<"vehicles">[]> {
  const { activeOnly = true } = opts;

  let query = client.from("vehicles").select("*");
  if (activeOnly) query = query.eq("active", true);
  query = query.order("max_pax", { ascending: true });

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/* ============================================================================
 * Posts
 * ============================================================================ */

export async function getPublishedPosts(
  client: CatalogClient,
  opts: PostListOpts = {}
): Promise<Tables<"posts">[]> {
  const { featured, limit } = opts;

  let query = client.from("posts").select("*").eq("status", "published");

  if (typeof featured === "boolean") query = query.eq("featured", featured);
  query = query
    .order("featured", { ascending: false })
    .order("published_at", { ascending: false, nullsFirst: false });
  if (typeof limit === "number" && limit > 0) query = query.limit(limit);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function getPostBySlug(
  client: CatalogClient,
  slug: string
): Promise<Tables<"posts"> | null> {
  if (!slug) return null;

  const { data, error } = await client
    .from("posts")
    .select("*")
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) throw error;
  return data ?? null;
}

/* ============================================================================
 * Partners (páginas aliadas)
 * ============================================================================ */

export interface PartnerListOpts {
  activeOnly?: boolean;
}

export async function getPartners(
  client: CatalogClient,
  opts: PartnerListOpts = {}
): Promise<Tables<"partners">[]> {
  const { activeOnly = true } = opts;

  let query = client.from("partners").select("*").is("deleted_at", null);
  if (activeOnly) query = query.eq("active", true);
  query = query.order("name", { ascending: true });

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}
