#!/usr/bin/env node
/**
 * PM 2026-06-22 (B): keys nuevas para el batch del review del cliente:
 *   - URLs de redes sociales (instagram_url, facebook_url, tiktok_url)
 *   - Aviso del formulario de contacto (contact_form_notice_es/en)
 *   - Sección "Our Story" de About (about_story_*)
 *
 * Idempotente: usa Prefer: resolution=ignore-duplicates, así re-correrlo
 * no pisa valores que el admin haya editado a mano.
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
  // Redes sociales
  { key: "instagram_url", value: "", description: "URL del perfil de Instagram. Vacío = ícono apagado." },
  { key: "facebook_url",  value: "", description: "URL del perfil de Facebook. Vacío = ícono apagado." },
  { key: "tiktok_url",    value: "https://www.tiktok.com/@living.in.prdise", description: "URL del perfil de TikTok." },

  // Contact form notice
  { key: "contact_form_notice_es", value: "Te responderemos al correo que dejes en este formulario, normalmente dentro de las 24 horas.", description: "Aviso bajo Send Message (ES)." },
  { key: "contact_form_notice_en", value: "We'll reply to the email you provide in this form, usually within 24 hours.",                 description: "Aviso bajo Send Message (EN)." },

  // About story
  { key: "about_story_image",       value: "",                                description: "Imagen principal del bloque Our Story en About." },
  { key: "about_story_tag_es",      value: "Nuestra historia",                description: "Etiqueta del bloque Our Story (ES)." },
  { key: "about_story_tag_en",      value: "Our Story",                       description: "Etiqueta del bloque Our Story (EN)." },
  { key: "about_story_title_es",    value: "NACIDOS EN CABO ROJO",            description: "Título Our Story (ES)." },
  { key: "about_story_title_en",    value: "BORN IN CABO ROJO",               description: "Título Our Story (EN)." },
  { key: "about_story_subtitle_es", value: "Una carta de amor a la costa oeste", description: "Subtítulo Our Story (ES)." },
  { key: "about_story_subtitle_en", value: "A love letter to the west coast",    description: "Subtítulo Our Story (EN)." },
  { key: "about_story_p1_es", value: "Living in PRDISE comenzó como un proyecto de pasión entre amigos que crecieron en la costa oeste de Puerto Rico. Vimos demasiados viajeros bajar del avión en San Juan y marcharse sin conocer lo que hace mágica a nuestra isla.", description: "Párrafo 1 (ES)." },
  { key: "about_story_p1_en", value: "Living in PRDISE started as a passion project among friends who grew up on the west coast of Puerto Rico. We saw too many travelers hop off the plane in San Juan and leave without knowing what makes our island magical.", description: "Párrafo 1 (EN)." },
  { key: "about_story_p2_es", value: "Así que construimos algo diferente — tours íntimos, estadías curadas y experiencias auténticas operadas por locales que realmente aman esta tierra.", description: "Párrafo 2 (ES)." },
  { key: "about_story_p2_en", value: "So we built something different — intimate tours, curated stays, and authentic experiences run by locals who actually love this land.", description: "Párrafo 2 (EN)." },
  { key: "about_story_p3_es", value: "Desde los acantilados del Faro Los Morrillos hasta las aguas luminiscentes de La Parguera, cada viaje está diseñado para mostrarte el verdadero Puerto Rico.", description: "Párrafo 3 (ES)." },
  { key: "about_story_p3_en", value: "From the cliffs of Los Morrillos Lighthouse to the luminescent waters of La Parguera, every trip is designed to show you the real Puerto Rico.", description: "Párrafo 3 (EN)." },
];

const res = await fetch(`${URL}/rest/v1/site_settings?on_conflict=key`, {
  method: "POST",
  headers,
  body: JSON.stringify(entries),
});
console.log(res.status);
console.log((await res.text()).slice(0, 500));
