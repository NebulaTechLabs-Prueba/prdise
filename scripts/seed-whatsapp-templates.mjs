#!/usr/bin/env node
/**
 * One-shot: inserta las 2 keys del WhatsApp prefill en site_settings con
 * valores default sensatos. Si ya existen, no las pisa.
 * PM 2026-06-22.
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
    key: "whatsapp_prefill_es",
    value: "¡Hola! Me interesan sus servicios en Puerto Rico (costa oeste y centro). ¿Pueden ayudarme?",
    description: "Mensaje pre-relleno cuando el cliente abre WhatsApp/SMS desde el FAB. Idioma español.",
  },
  {
    key: "whatsapp_prefill_en",
    value: "Hi! I'm interested in your services in Puerto Rico (West Coast & Central). Can you help me?",
    description: "Pre-filled message when the customer opens WhatsApp/SMS from the FAB. English version.",
  },
];

const res = await fetch(`${URL}/rest/v1/site_settings?on_conflict=key`, {
  method: "POST",
  headers,
  body: JSON.stringify(entries),
});
console.log(res.status, await res.text());
