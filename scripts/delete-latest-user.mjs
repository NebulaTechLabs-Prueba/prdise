#!/usr/bin/env node
/**
 * Borra el usuario más reciente (NO admin) — útil para liberar un correo de
 * prueba y volver a usarlo en signup. PM 2026-06-17.
 *
 * Uso: node scripts/delete-latest-user.mjs
 */
import { readFile } from "node:fs/promises";

const env = await readFile(".env.local", "utf8").then((s) => {
  const out = {};
  for (const line of s.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    out[m[1]] = m[2].replace(/^"|"$/g, "");
  }
  return out;
});

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) {
  console.error("Faltan envs");
  process.exit(1);
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` };

const res = await fetch(`${URL}/auth/v1/admin/users?per_page=200`, { headers });
if (!res.ok) {
  console.error("list failed", res.status, await res.text());
  process.exit(1);
}
const { users } = await res.json();
// Ordenar por created_at desc — el más reciente arriba
users.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

const skip = new Set(["admin@livinginprdise.com"]);
const target = users.find((u) => !skip.has((u.email || "").toLowerCase()));
if (!target) {
  console.log("No hay usuarios borrables");
  process.exit(0);
}

console.log(`Eliminando: ${target.email} (id ${target.id}, creado ${target.created_at})`);

const del = await fetch(`${URL}/auth/v1/admin/users/${target.id}`, {
  method: "DELETE",
  headers,
});
if (!del.ok) {
  console.error("delete failed", del.status, await del.text());
  process.exit(1);
}
console.log("OK — usuario eliminado, correo liberado para reutilizar");
