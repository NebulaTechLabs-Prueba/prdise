#!/usr/bin/env node
/**
 * PM 2026-06-22: reset usuarios de prueba a un estado conocido para que el
 * cliente pueda entrar sin "se me olvidó la contraseña":
 *
 *   admin@livinginprdise.com         → name "Admin",          pwd = email
 *   cliente_Test@livinginprdise.com  → name "Cliente Test",   pwd = email
 *
 * También limpia usuarios remanentes de pruebas previas (ej. correos
 * personales del equipo) — el cliente pidió que NO quede ningún correo
 * de prueba que no sean los 2 oficiales.
 *
 * Idempotente: usa upsert por email (auth admin API) + update por id.
 */
import { readFile } from "node:fs/promises";

const env = await readFile(".env.local", "utf8").then((s) => {
  const out = {};
  for (const line of s.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
});

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
};

const TARGETS = [
  { email: "admin@livinginprdise.com",        firstName: "Admin",        lastName: "", role: "admin" },
  { email: "cliente_Test@livinginprdise.com", firstName: "Cliente Test", lastName: "", role: "user"  },
];
const KEEP_EMAILS = new Set(TARGETS.map(t => t.email.toLowerCase()));

// 1) Listar usuarios actuales
const list = await fetch(`${URL}/auth/v1/admin/users?per_page=200`, { headers });
if (!list.ok) {
  console.error("listUsers FAIL", list.status, await list.text());
  process.exit(1);
}
const { users } = await list.json();
console.log("=== Usuarios actuales ===");
for (const u of users) console.log(`  ${u.email}  (${u.id})`);

// 2) Borrar TODOS los que no sean los oficiales
for (const u of users) {
  if (KEEP_EMAILS.has((u.email || "").toLowerCase())) continue;
  console.log(`Eliminando ${u.email}…`);
  const r = await fetch(`${URL}/auth/v1/admin/users/${u.id}`, {
    method: "DELETE",
    headers,
  });
  if (!r.ok) console.warn(`  FAIL ${r.status}: ${await r.text()}`);
}

// 3) Asegurar que cada target exista, tenga el password = email y el profile
//    con first_name / last_name correctos.
for (const t of TARGETS) {
  // Buscar por email (case-insensitive) en la lista cacheada arriba
  const existing = users.find(
    (u) => (u.email || "").toLowerCase() === t.email.toLowerCase()
  );
  let id = existing?.id;

  if (!existing) {
    console.log(`Creando ${t.email}…`);
    const r = await fetch(`${URL}/auth/v1/admin/users`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        email: t.email,
        password: t.email, // pwd = email exacto, tal como pidió el cliente
        email_confirm: true,
        user_metadata: { first_name: t.firstName, last_name: t.lastName },
      }),
    });
    if (!r.ok) {
      console.error(`  CREATE FAIL ${r.status}: ${await r.text()}`);
      continue;
    }
    const data = await r.json();
    id = data.id;
  } else {
    // Update password + email_confirm
    console.log(`Reseteando password de ${t.email}…`);
    const r = await fetch(`${URL}/auth/v1/admin/users/${id}`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ password: t.email, email_confirm: true }),
    });
    if (!r.ok) console.warn(`  PWD FAIL ${r.status}: ${await r.text()}`);
  }

  // Profile (table public.profiles)
  const profilePatch = {
    first_name: t.firstName,
    last_name: t.lastName,
    role: t.role,
    status: "active",
  };
  const r2 = await fetch(`${URL}/rest/v1/profiles?id=eq.${id}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify(profilePatch),
  });
  if (!r2.ok) {
    console.warn(`  PROFILE PATCH FAIL: ${await r2.text()}`);
    continue;
  }
  const arr = await r2.json();
  if (arr.length === 0) {
    // El trigger no creó la fila (raro). Insertarla manualmente.
    const r3 = await fetch(`${URL}/rest/v1/profiles`, {
      method: "POST",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({ id, ...profilePatch }),
    });
    if (!r3.ok) console.warn(`  PROFILE INSERT FAIL: ${await r3.text()}`);
  }
}

console.log("\n=== Verificación final ===");
const list2 = await fetch(`${URL}/auth/v1/admin/users?per_page=200`, { headers });
const { users: users2 } = await list2.json();
for (const u of users2) {
  const p = await fetch(`${URL}/rest/v1/profiles?id=eq.${u.id}&select=first_name,last_name,role`, { headers });
  const pj = await p.json();
  const prof = pj[0] || {};
  console.log(`  ${u.email.padEnd(40)} | ${(prof.first_name || "—").padEnd(15)} ${prof.last_name || ""} | role=${prof.role || "—"}`);
}
console.log("\nOK — usuarios oficiales con password = correo.");
