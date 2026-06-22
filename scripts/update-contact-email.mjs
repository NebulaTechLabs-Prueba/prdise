#!/usr/bin/env node
/**
 * One-shot: actualiza site_settings.contact_email en la DB remota.
 * PM 2026-06-22: cliente pidió cambiar de info@prdise.com a livinginprdise@gmail.com.
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

const res = await fetch(`${URL}/rest/v1/site_settings?on_conflict=key`, {
  method: "POST",
  headers,
  body: JSON.stringify([{ key: "contact_email", value: "livinginprdise@gmail.com" }]),
});
console.log(res.status, await res.text());
