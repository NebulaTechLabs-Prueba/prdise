/**
 * Backfill one-shot de imágenes en stays y tours para la entrega del sistema.
 *
 * PM 2026-06-15: requisito previo a handoff — todo servicio existente debe
 * tener al menos una imagen propia. NUEVOS servicios que el admin cree
 * después seguirán cayendo al placeholder (IMG_PALM via resolveImg) hasta
 * que el admin asigne imágenes desde el form. Este script NO automatiza
 * ese flujo — sólo rellena el estado actual.
 *
 * Estrategia:
 *  - Categorizamos cada servicio por keywords en el slug/título (UTV,
 *    kayak, snorkel, sail, jet-ski, beach-gear, bio-bay, jayuya, horse,
 *    adventure, etc.).
 *  - Cada categoría tiene 3-4 URLs estables (Unsplash IDs verificados +
 *    Picsum seeded como fallback determinístico para categorías escasas).
 *  - Distribuimos por hash(slug) % length para que la asignación sea
 *    determinística pero variada (no todos los kayaks con la misma foto).
 *  - Cada servicio recibe 3 imágenes: cover + 2 secundarias del mismo set.
 *
 * Se ejecuta solo sobre filas con images=[] o NULL para no pisar las que
 * el admin ya curó manualmente. Pasar --force para sobrescribir todas.
 *
 * NO toca transfers (vehicles/routes) — directiva del PM.
 *
 * Uso:
 *   node --env-file=.env.local scripts/backfill-images.mjs
 *   node --env-file=.env.local scripts/backfill-images.mjs --force
 *   node --env-file=.env.local scripts/backfill-images.mjs --dry-run
 */

import { createClient } from "@supabase/supabase-js";

const FORCE = process.argv.includes("--force");
const DRY = process.argv.includes("--dry-run");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const sb = createClient(url, key);

// ─── Catálogo de imágenes por categoría ─────────────────────────────────
// Dos fuentes mezcladas:
//   - "u:<id>"  → Unsplash CDN, photo IDs verificados con HEAD HTTP (vivos).
//   - "p:<seed>" → Picsum (https://picsum.photos), deterministic por seed,
//                   siempre carga aunque no sea contextual. Se usa como
//                   complemento para categorías con pocos Unsplash vivos.
//
// Si en el futuro se quieren reemplazar las p: por Unsplash contextuales,
// validar con tmp_validate_urls.mjs antes de añadir aquí.
const CATS = {
  utv: ["u:1604147495798-57beb5d6af73","u:1626668893632-6f3a4466d22f","p:utv-1","p:utv-2"],
  kayak: ["u:1505761671935-60b3a7427bad","p:kayak-1","p:kayak-2","p:kayak-3"],
  snorkel: ["u:1582967788606-a171c1080cb0","u:1530541930197-ff16ac917b0e","u:1559666126-84f389727b9a","u:1559827260-dc66d52bef19"],
  sail: ["u:1473625247510-8ceb1760943f","u:1540541338287-41700207dee6","p:sail-1","p:sail-2"],
  jetski: ["u:1602080858428-57174f9431cf","p:jetski-1","p:jetski-2"],
  banana: ["u:1559827260-dc66d52bef19","p:banana-1","p:banana-2"],
  paddle: ["u:1518611012118-696072aa579a","u:1502680390469-be75c86b636f","u:1543674892-7d64d45df18b"],
  beach_gear: ["u:1507525428034-b723cf961d3e","u:1519046904884-53103b34b206","u:1505228395891-9a51e7e86bf6","u:1473496169904-658ba7c44d8a"],
  bio_bay: ["p:biobay-1","p:biobay-2","p:biobay-3"],
  horse: ["u:1553284965-83fd3e82fa5a","u:1568605114967-8130f3a36994","u:1534773728080-33d31da27ae5"],
  cultural: ["u:1495474472287-4d71bcdd2085","u:1442570468985-f63ed5de9086","p:cultural-1"],
  adventure: ["u:1551632811-561732d1e306","u:1533105079780-92b9be482077","u:1551632436-cbf8dd35adfa"],
  beach_stay: ["u:1571896349842-33c89424de2d","u:1564013799919-ab600027ffc6","u:1582719508461-905c673771fd","u:1540541338287-41700207dee6"],
};

function toUrl(token) {
  if (token.startsWith("u:")) {
    return `https://images.unsplash.com/photo-${token.slice(2)}?w=1600&q=80&auto=format&fit=crop`;
  }
  if (token.startsWith("p:")) {
    return `https://picsum.photos/seed/${token.slice(2)}/1600/900`;
  }
  return token;
}

// ─── Categorización por keywords del slug+título ────────────────────────
function categorize(slug, title) {
  const s = `${slug} ${title || ""}`.toLowerCase();
  if (/\butv\b|off[\s-]?road|atv|buggy/.test(s)) return "utv";
  if (/jet[\s-]?ski/.test(s)) return "jetski";
  if (/banana/.test(s)) return "banana";
  if (/snorkel/.test(s)) return "snorkel";
  if (/paddle|\bsup\b|water[\s-]?bike/.test(s)) return "paddle";
  if (/kayak/.test(s)) return "kayak";
  if (/sail|sunset|charter|yacht/.test(s)) return "sail";
  if (/bio[\s-]?bay|bioluminescen/.test(s)) return "bio_bay";
  if (/horse|pony|equestrian|ride/.test(s)) return "horse";
  if (/jayuya|cultural|coffee|mountain|hacienda/.test(s)) return "cultural";
  if (/tanam|cave|river|zipline|adventure|tour/.test(s)) return "adventure";
  if (/beach[\s-]?(chair|tent|umbrella)|table|domino|rental/.test(s)) return "beach_gear";
  if (/boat|premium|floating/.test(s)) return "sail";
  return "adventure";
}

// Hash determinístico (djb2) para que `slug → idx` sea estable entre runs.
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function pickImages(cat, slug) {
  const pool = CATS[cat] || CATS.adventure;
  const start = hash(slug) % pool.length;
  const out = [];
  for (let i = 0; i < 3; i++) {
    const token = pool[(start + i) % pool.length];
    out.push(toUrl(token));
  }
  return out;
}

// ─── Pasada principal ────────────────────────────────────────────────────
async function processTable(table, label) {
  console.log(`\n=== ${label.toUpperCase()} ===`);
  const { data: rows, error } = await sb
    .from(table)
    .select("id, slug, title_es, title_en, images");
  if (error) { console.error(`${label} err:`, error); return 0; }

  const targets = (rows || []).filter((r) => {
    if (FORCE) return true;
    return !Array.isArray(r.images) || r.images.length === 0 ||
           (r.images.length === 1 && /1564501049412/.test(r.images[0])); // placeholder genérico legacy
  });
  console.log(`Total: ${rows.length} | A actualizar: ${targets.length}${FORCE ? " (--force)" : ""}`);

  let updated = 0;
  for (const r of targets) {
    const title = r.title_es || r.title_en || r.slug;
    // Stays = alojamientos siempre, no aplica la heurística por keyword
    // de actividad. Los tours sí caen en cualquier categoría.
    const cat = table === "stays" ? "beach_stay" : categorize(r.slug, title);
    const imgs = pickImages(cat, r.slug);
    console.log(`  [${cat.padEnd(11)}] ${r.slug.slice(0, 60).padEnd(62)} → ${imgs[0].slice(33, 80)}`);
    if (DRY) continue;
    const { error: upErr } = await sb.from(table).update({ images: imgs }).eq("id", r.id);
    if (upErr) console.error(`     ! error: ${upErr.message}`);
    else updated++;
  }
  console.log(`${label}: actualizados ${updated}/${targets.length}.`);
  return updated;
}

const stays = await processTable("stays", "Stays");
const tours = await processTable("tours", "Tours");

console.log(`\n${DRY ? "[DRY-RUN] " : ""}Total: ${stays + tours} servicios actualizados.`);
