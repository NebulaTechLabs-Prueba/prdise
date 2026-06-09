/**
 * Backfill de `public.profiles` desde `auth.users` tras un `db reset --linked`.
 *
 * El reset dropea el schema public (incluyendo profiles) y vuelve a aplicar
 * migraciones. El trigger `tg_handle_new_user` solo dispara en INSERTs nuevos,
 * así que los auth.users que ya existían quedan huérfanos sin profile y no
 * pueden loguear. Este script los re-genera.
 *
 * Uso:  node scripts/backfill-profiles.mjs
 *
 * Idempotente: usa ON CONFLICT (id) DO NOTHING. Se puede correr múltiples veces.
 *
 * IMPORTANTE: este script asigna role='user' por defecto. Después de correrlo
 * hay que promover manualmente al admin desde Supabase Dashboard:
 *   UPDATE public.profiles SET role = 'admin' WHERE email = 'tu-admin@email.com';
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const envPath = join(process.cwd(), ".env.local");
const env = Object.fromEntries(
  readFileSync(envPath, "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const idx = l.indexOf("=");
      return [l.slice(0, idx).trim(), l.slice(idx + 1).trim()];
    })
);

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (error) {
  console.error("listUsers falló:", error.message);
  process.exit(1);
}

if (!data?.users?.length) {
  console.log("No hay auth.users — nada que backfillear.");
  process.exit(0);
}

console.log(`Encontrados ${data.users.length} auth.users. Backfilleando...`);

const rows = data.users.map((u) => {
  const meta = u.user_metadata || {};
  return {
    id: u.id,
    email: u.email || null,
    first_name: meta.first_name || meta.full_name?.split(" ")[0] || null,
    last_name: meta.last_name || meta.full_name?.split(" ").slice(1).join(" ") || null,
    role: "user",
    status: "active",
  };
});

const { error: upsertError } = await admin
  .from("profiles")
  .upsert(rows, { onConflict: "id" });

if (upsertError) {
  console.error("upsert profiles falló:", upsertError.message);
  process.exit(1);
}

console.log(`✓ ${rows.length} profile(s) creados/preservados.`);
console.log("");
console.log("Usuarios encontrados:");
for (const u of data.users) {
  console.log(`  - ${u.email || "(sin email)"} (id: ${u.id})`);
}
console.log("");
console.log("Si alguno debe ser admin, corré desde Supabase Dashboard:");
console.log("  UPDATE public.profiles SET role = 'admin' WHERE email = 'EMAIL_DEL_ADMIN';");
