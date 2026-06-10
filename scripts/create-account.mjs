/**
 * Crea cuentas en auth.users (con email_confirmed = true) y profile en
 * public.profiles. Útil para:
 *   - bootstrap del admin tras un db reset (sin SMTP funcional)
 *   - generar un cliente de prueba rápido
 *
 * Idempotente: si la cuenta ya existe, no la duplica; opcionalmente
 * resetea su password si pasas --reset-password.
 *
 * Uso:
 *   node scripts/create-account.mjs --email=admin@x.com --password=PassSeg123 --role=admin --name="Admin Christopher"
 *   node scripts/create-account.mjs --email=cliente@x.com --password=Test1234 --role=user --name="Cliente Prueba" --phone="+1 787 555 1234"
 *
 * Args:
 *   --email      (requerido)
 *   --password   (requerido; min 8 chars)
 *   --role       admin | user  (default: user)
 *   --name       "Nombre Apellido" (se parte en first/last)
 *   --phone      teléfono (opcional)
 *   --reset-password  fuerza el password si la cuenta ya existe
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

// ─── Args ─────────────────────────────────────────────────────────────────
function getArg(name, fallback) {
  const pref = `--${name}=`;
  const found = process.argv.find((a) => a.startsWith(pref));
  if (found) return found.slice(pref.length);
  // also support --name value
  const idx = process.argv.findIndex((a) => a === `--${name}`);
  if (idx >= 0 && process.argv[idx + 1] && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return fallback;
}
const email = getArg("email");
const password = getArg("password");
const role = getArg("role", "user");
const name = getArg("name", "");
const phone = getArg("phone", "");
const resetPassword = process.argv.includes("--reset-password");

if (!email || !password) {
  console.error("Uso: node scripts/create-account.mjs --email=X --password=Y [--role=admin|user] [--name=\"N L\"] [--phone=...]");
  process.exit(1);
}
if (password.length < 8) {
  console.error("Password debe tener al menos 8 caracteres.");
  process.exit(1);
}
if (!["admin", "user"].includes(role)) {
  console.error("--role debe ser 'admin' o 'user'.");
  process.exit(1);
}
const [first_name = null, ...rest] = name.trim().split(/\s+/);
const last_name = rest.length ? rest.join(" ") : null;

// ─── Env ──────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(join(process.cwd(), ".env.local"), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}
const supa = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Lookup existente ─────────────────────────────────────────────────────
const { data: list, error: listErr } = await supa.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listErr) {
  console.error("listUsers falló:", listErr.message);
  process.exit(1);
}
const existing = list.users.find((u) => (u.email || "").toLowerCase() === email.toLowerCase());

let userId;
if (existing) {
  userId = existing.id;
  console.log(`Usuario ya existe: ${email} (id ${userId})`);
  if (resetPassword) {
    const { error: upErr } = await supa.auth.admin.updateUserById(userId, { password, email_confirm: true });
    if (upErr) { console.error("updateUserById:", upErr.message); process.exit(1); }
    console.log("  ✓ Password reseteada y email confirmado.");
  } else if (!existing.email_confirmed_at) {
    const { error: upErr } = await supa.auth.admin.updateUserById(userId, { email_confirm: true });
    if (upErr) { console.error("email_confirm:", upErr.message); process.exit(1); }
    console.log("  ✓ Email forzado a confirmado.");
  } else {
    console.log("  (sin cambios — pasa --reset-password para forzar nueva password)");
  }
} else {
  const { data, error } = await supa.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { first_name, last_name, phone: phone || null },
  });
  if (error) { console.error("createUser:", error.message); process.exit(1); }
  userId = data.user.id;
  console.log(`✓ Usuario creado: ${email} (id ${userId})`);
}

// ─── Profile (trigger ya creó la fila si era nueva; upserteamos el rol +
//     datos personales para idempotencia) ────────────────────────────────
const { error: upErr } = await supa
  .from("profiles")
  .upsert({
    id: userId,
    role,
    status: "active",
    first_name: first_name || null,
    last_name: last_name || null,
    phone: phone || null,
  }, { onConflict: "id" });
if (upErr) { console.error("upsert profile:", upErr.message); process.exit(1); }
console.log(`✓ Profile actualizado con role='${role}'.`);

console.log("");
console.log("───────────────────────────────────────────");
console.log("Credenciales finales (guardalas seguras):");
console.log(`  Email:    ${email}`);
console.log(`  Password: ${password}`);
console.log(`  Role:     ${role}`);
console.log(`  Login:    http://46.225.63.21/#/login`);
if (role === "admin") {
  console.log(`  Admin:    http://46.225.63.21/#/admin`);
}
console.log("───────────────────────────────────────────");
