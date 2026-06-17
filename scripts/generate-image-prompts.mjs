/**
 * Genera un archivo Markdown con un prompt contextual por servicio,
 * listo para pegar en generadores de imágenes (Midjourney, DALL·E,
 * Stable Diffusion, Imagen, etc.).
 *
 * PM 2026-06-15: el cliente rechazó las imágenes placeholder de Picsum
 * por no ser representativas. Solicita prompts por servicio para
 * generar imágenes contextuales y subirlas como archivo via el admin.
 *
 * Estrategia:
 *  - Lee TODOS los stays + tours de Supabase (excepto transfers, por
 *    directiva PM previa).
 *  - Categoriza por keywords del slug/título (UTV, kayak, sail, etc.).
 *  - Por categoría aplica un template de prompt fotorrealista neutral
 *    de modelo (estilo natural-light, wide-angle, vibrant) y le inyecta
 *    el título + locación + descripción corta para singularidad.
 *  - Output: docs/image-prompts.md con secciones por categoría y, dentro,
 *    una entrada por servicio (slug + title + prompt copy-paste).
 *
 * Uso:
 *   node --env-file=.env.local scripts/generate-image-prompts.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const sb = createClient(url, key);

// ─── Templates por categoría (campo {detail} reemplazado por contexto)  ─────
// El cierre fotográfico es uniforme para consistencia de marca; lo único
// que cambia es la escena y el sujeto. Sufijo común al final.
const SUFFIX =
  " Photorealistic, golden-hour natural lighting, vibrant tropical color " +
  "palette, 16:9 wide-angle composition, cinematic depth of field, no text, " +
  "no watermark, no people facing the camera.";

const TEMPLATES = {
  utv: (d) =>
    `A rugged 4-seat off-road UTV buggy splashing through a muddy jungle trail in Puerto Rico's western mountains, drivers in helmets, lush green foliage and palm trees in the background${d}.`,
  kayak: (d) =>
    `Single-paddler clear-water kayak gliding across a turquoise bay in western Puerto Rico, mangroves and small cays in the distance, crisp tropical morning light${d}.`,
  snorkel: (d) =>
    `Snorkeler floating over a vibrant Caribbean coral reef off Puerto Rico's south coast, schools of tropical fish and rays of sunlight piercing the clear water${d}.`,
  sail: (d) =>
    `White-sail catamaran cruising at sunset off Rincón, Puerto Rico, deep blue ocean, warm orange sky reflecting on hull, wake trailing behind${d}.`,
  jetski: (d) =>
    `Pair of yellow jet-skis carving turns in turquoise Caribbean water near Buyé Beach Cabo Rojo, splash arcs, palm-lined coastline in background${d}.`,
  banana: (d) =>
    `Inflatable yellow banana boat being pulled by a speedboat across crystal water near Cabo Rojo, riders laughing, foamy wake, tropical beach behind${d}.`,
  paddle: (d) =>
    `Stand-up paddleboarder gliding over glassy turquoise shallows at sunrise near Buyé Beach Puerto Rico, perfect reflection, distant lighthouse silhouette${d}.`,
  beach_gear: (d) =>
    `Premium beach setup on Buyé Beach Cabo Rojo at midday — colorful umbrella, two lounge chairs, small wooden side table, palm shade, turquoise water lapping the white sand${d}.`,
  domino: (d) =>
    `Cozy beachside wooden table set up under a palm tree on Buyé Beach Cabo Rojo with a domino game laid out, cold drinks, casual Puerto Rican coastal vibe${d}.`,
  bio_bay: (d) =>
    `Bioluminescent bay at night in La Parguera Puerto Rico, glowing blue plankton trails behind a kayak paddle, starry sky reflected on the dark water, mangrove silhouettes${d}.`,
  horse: (d) =>
    `Horseback rider trotting along the white-sand beach of Rincón Puerto Rico at golden hour, gentle waves washing the shoreline, hoof prints behind${d}.`,
  pony: (d) =>
    `Small Puerto Rican pony with a child rider walking gently along the marina boardwalk in Rincón, blue boats moored behind, warm afternoon light${d}.`,
  cultural: (d) =>
    `Hillside coffee hacienda in Jayuya Puerto Rico, traditional wooden buildings, lush mountain backdrop, women in colorful skirts grinding coffee, soft midday haze${d}.`,
  cultural_attractions: (d) =>
    `Indigenous Taíno petroglyphs carved into a granite boulder in the Jayuya highlands, surrounded by tropical ferns, dramatic side lighting revealing the texture${d}.`,
  adventure: (d) =>
    `Adventurers rappelling into a hidden limestone river cave in Arecibo Puerto Rico (Tanamá area), helmet headlamps illuminating crystal-clear blue water${d}.`,
  boat: (d) =>
    `Sleek private dive/snorkel boat anchored over turquoise reef off La Parguera Puerto Rico, captain at the helm, swim platform deployed, mid-morning sunshine${d}.`,
  floating_table: (d) =>
    `Floating wooden table anchored in waist-deep turquoise water off La Parguera Puerto Rico, fresh seafood platter and cold drinks on top, two empty chairs, blue sky${d}.`,
  beach_stay: (d) =>
    `Elegant beachfront villa exterior in Cabo Rojo Puerto Rico at dusk, warm interior lights glowing, palm trees framing the entrance, pool reflecting the sky${d}.`,
};

function categorize(slug, title) {
  const s = `${slug} ${title || ""}`.toLowerCase();
  if (/floating[\s-]?table|mesa[\s-]?salada/.test(s)) return "floating_table";
  if (/\butv\b|off[\s-]?road|atv|buggy/.test(s)) return "utv";
  if (/jet[\s-]?ski/.test(s)) return "jetski";
  if (/banana/.test(s)) return "banana";
  if (/snorkel/.test(s)) return "snorkel";
  if (/paddle|\bsup\b|water[\s-]?bike/.test(s)) return "paddle";
  if (/kayak/.test(s)) return "kayak";
  if (/sail|sunset|charter|yacht/.test(s)) return "sail";
  if (/bio[\s-]?bay|bioluminescen/.test(s)) return "bio_bay";
  if (/pony/.test(s)) return "pony";
  if (/horse|equestrian|\bride\b/.test(s)) return "horse";
  if (/jayuya.*(attractions|individual)/.test(s)) return "cultural_attractions";
  if (/jayuya|cultural|coffee|mountain|hacienda/.test(s)) return "cultural";
  if (/tanam|cave|river|zipline|adventure/.test(s)) return "adventure";
  if (/domino/.test(s)) return "domino";
  if (/beach[\s-]?(chair|tent|umbrella)|table[\s-]?rental|rental$/.test(s)) return "beach_gear";
  if (/boat|premium/.test(s)) return "boat";
  return "adventure";
}

function buildDetail(row) {
  // Inyecta título + locación + descripción corta como "context tail" para
  // que el prompt no sea idéntico entre dos servicios de la misma categoría.
  const parts = [];
  const title = (row.title_es || row.title_en || "").trim();
  if (title) parts.push(`Inspired by "${title}"`);
  if (row.location) parts.push(`location: ${row.location}`);
  const desc = (row.short_desc_es || row.short_desc_en || "").trim();
  if (desc) parts.push(desc.replace(/\s+/g, " ").slice(0, 160));
  return parts.length ? `. ${parts.join("; ")}` : "";
}

function buildPrompt(row, forceCat) {
  const cat = forceCat || categorize(row.slug, row.title_es || row.title_en);
  const template = TEMPLATES[cat] || TEMPLATES.adventure;
  return template(buildDetail(row)) + SUFFIX;
}

// ─── Pull data ──────────────────────────────────────────────────────────────
const { data: stays, error: e1 } = await sb
  .from("stays")
  .select("slug, title_es, title_en, location, short_desc_es, short_desc_en")
  .order("title_es");
if (e1) { console.error("stays err:", e1); process.exit(1); }

const { data: tours, error: e2 } = await sb
  .from("tours")
  .select("slug, title_es, title_en, location, short_desc_es, short_desc_en")
  .order("title_es");
if (e2) { console.error("tours err:", e2); process.exit(1); }

// ─── Build markdown ─────────────────────────────────────────────────────────
const lines = [];
lines.push("# Prompts de imágenes por servicio");
lines.push("");
lines.push(`> Generado: ${new Date().toISOString().slice(0, 10)}`);
lines.push("");
lines.push("Pegá cada prompt en tu generador de imágenes preferido (Midjourney,");
lines.push("DALL·E 3, Stable Diffusion, Imagen). Todos los prompts comparten un");
lines.push("sufijo común para que el resultado tenga estética consistente con la");
lines.push("marca (fotorrealista, golden-hour, paleta tropical, sin texto ni");
lines.push("watermark, sin caras directas).");
lines.push("");
lines.push("Subí la imagen resultante via el form del admin →");
lines.push("`Edit service → Cover Image / Gallery Images`. Soporta tanto URL");
lines.push("como upload directo de archivo.");
lines.push("");
lines.push("---");
lines.push("");

function section(title, rows, forceCat) {
  lines.push(`## ${title} (${rows.length})`);
  lines.push("");
  for (const r of rows) {
    const t = r.title_es || r.title_en || r.slug;
    const cat = forceCat || categorize(r.slug, r.title_es || r.title_en);
    lines.push(`### ${t}`);
    lines.push(`*slug: \`${r.slug}\` · cat: \`${cat}\` · loc: ${r.location || "—"}*`);
    lines.push("");
    lines.push("```");
    lines.push(buildPrompt(r, forceCat));
    lines.push("```");
    lines.push("");
  }
}

// Stays siempre con template de villa beachfront (no categorize por desc, que
// puede traer texto del tour si el admin lo mezcló).
section("Stays", stays || [], "beach_stay");
section("Tours", tours || []);

const outPath = "docs/image-prompts.md";
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, lines.join("\n"), "utf8");
console.log(`Generado: ${outPath}`);
console.log(`Stays: ${stays?.length || 0}, Tours: ${tours?.length || 0}`);
