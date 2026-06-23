#!/usr/bin/env node
/**
 * PM 2026-06-23: seed de las 4 keys del modo mantenimiento.
 * Idempotente: ignore-duplicates → no pisa valores que el admin ya editó.
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
  Prefer: "resolution=ignore-duplicates,return=representation",
};

const entries = [
  {
    key: "site_maintenance_mode",
    value: "false",
    description: 'Cuando es "true", visitantes anónimos y clientes ven la pantalla de mantenimiento. El admin sigue navegando normal.',
  },
  {
    key: "site_maintenance_message_es",
    value: "Estamos actualizando el sitio para que tu próxima experiencia sea aún mejor. En breve volvemos a recibirte. Si tu consulta no puede esperar, escribinos por WhatsApp y te respondemos personalmente.",
    description: "Mensaje ES de la pantalla de mantenimiento.",
  },
  {
    key: "site_maintenance_message_en",
    value: "We are updating the site so your next experience is even better. We will be back shortly. If your request cannot wait, message us on WhatsApp and we will reply personally.",
    description: "EN message for the maintenance screen.",
  },
  {
    key: "site_maintenance_eta",
    value: "",
    description: "Texto libre opcional (ej. 15 minutos, esta noche).",
  },
];

const res = await fetch(`${URL}/rest/v1/site_settings?on_conflict=key`, {
  method: "POST",
  headers,
  body: JSON.stringify(entries),
});
console.log(res.status);
console.log((await res.text()).slice(0, 500));
