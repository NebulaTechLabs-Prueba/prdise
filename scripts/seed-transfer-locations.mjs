#!/usr/bin/env node
/**
 * PM 2026-06-22: ajusta transfer_locations según el review del cliente.
 *
 *   - Quita "San Juan Hotel" (set active=false; no se borra para preservar
 *     histórico de bookings que apunten a él).
 *   - Agrega aeropuerto de Ponce (PSE).
 *   - Agrega pueblos: Lajas, Aguadilla, Cabo Rojo, Jayuya, Aguada, Añasco.
 *
 * Idempotente: usa upsert por `name`. Re-correrlo no duplica.
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
  Prefer: "resolution=merge-duplicates,return=representation",
};

// 1) Listado actual para diagnóstico
const list = await fetch(`${URL}/rest/v1/transfer_locations?select=name,label_es,label_en,active&order=sort_order.asc`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
const current = await list.json();
console.log("LOCATIONS ACTUALES:");
for (const l of current) console.log(`  ${l.active ? "✓" : "✗"} ${l.name.padEnd(28)} ${l.label_es}`);

// 2) Quitar "San Juan Hotel" (variantes posibles del name)
const toDeactivateNames = ["san_juan_hotel", "san-juan-hotel", "sanjuanhotel", "san_juan_hotels"];
for (const n of toDeactivateNames) {
  const r = await fetch(`${URL}/rest/v1/transfer_locations?name=eq.${encodeURIComponent(n)}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ active: false }),
  });
  if (r.ok) {
    const body = await r.json();
    if (body.length) console.log(`Desactivado: ${n}`);
  }
}

// 3) Insertar / mergear los pedidos
const toUpsert = [
  // Aeropuertos
  { name: "pse_airport", label_es: "Aeropuerto de Ponce (PSE)", label_en: "Ponce Airport (PSE)", sort_order: 13, active: true },
  // Pueblos del oeste y centro
  { name: "lajas",      label_es: "Lajas",      label_en: "Lajas",      sort_order: 40, active: true },
  { name: "aguadilla",  label_es: "Aguadilla",  label_en: "Aguadilla",  sort_order: 41, active: true },
  { name: "cabo_rojo",  label_es: "Cabo Rojo",  label_en: "Cabo Rojo",  sort_order: 42, active: true },
  { name: "jayuya",     label_es: "Jayuya",     label_en: "Jayuya",     sort_order: 43, active: true },
  { name: "aguada",     label_es: "Aguada",     label_en: "Aguada",     sort_order: 44, active: true },
  { name: "anasco",     label_es: "Añasco",     label_en: "Añasco",     sort_order: 45, active: true },
];

const up = await fetch(`${URL}/rest/v1/transfer_locations?on_conflict=name`, {
  method: "POST",
  headers,
  body: JSON.stringify(toUpsert),
});
const upBody = await up.text();
console.log("\nUPSERT:", up.status);
console.log(upBody.slice(0, 800));
