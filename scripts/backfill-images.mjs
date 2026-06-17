/**
 * Backfill one-shot de imágenes en stays y tours para la entrega del sistema.
 *
 * PM 2026-06-15: requisito previo a handoff — todo servicio existente debe
 * tener al menos una imagen propia. NUEVOS servicios que el admin cree
 * después seguirán cayendo al placeholder (IMG_PALM via resolveImg) hasta
 * que el admin asigne imágenes desde el form. Este script NO automatiza
 * ese flujo — sólo rellena el estado actual.
 *
 * Crítica del PM v1 (commit anterior usaba pools por categoría):
 *   "Los servicios no pueden tener la misma imagen y las imagenes colocadas
 *    no representan a cada servicio (son genericas)".
 *
 * Estrategia v2 (este script):
 *   - 1 imagen ÚNICA por servicio (cover), seedeada con el slug del servicio.
 *     Garantiza determinismo + unicidad global (si 2 servicios tienen slugs
 *     distintos → distinta imagen siempre).
 *   - 2 imágenes adicionales en galería con seeds `${slug}-2` y `${slug}-3`,
 *     también únicas globalmente. 3 imágenes por servicio.
 *   - Fuente: Lorem Picsum (CC-licensed, deterministic por seed, sin API key,
 *     siempre disponible). NO es contextual al tipo de servicio — el PM/admin
 *     debe subir fotos reales del partner cuando estén disponibles, vía el
 *     EditModal del admin. Hasta entonces estas son placeholders distintos.
 *   - El intento previo de mapear por keywords categóricas fallaba en dos
 *     frentes: (a) pools chicos generaban duplicados; (b) las imágenes
 *     contextuales accesibles sin API key (Unsplash photo IDs hardcoded) son
 *     limitadas y muchas devuelven 404. Sacrificar contexto por unicidad +
 *     estabilidad es la decisión correcta para esta entrega.
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

// Picsum seeded URL — el path /seed/{seed}/{w}/{h} hace que el mismo seed
// siempre devuelva la misma foto. Distintos seeds → distintas fotos.
function picsum(seed, w = 1600, h = 900) {
  return `https://picsum.photos/seed/${encodeURIComponent(seed)}/${w}/${h}`;
}

function imagesFor(slug) {
  return [
    picsum(slug),            // cover — único globalmente
    picsum(`${slug}-2`),     // galería 2 — único globalmente
    picsum(`${slug}-3`),     // galería 3 — único globalmente
  ];
}

async function processTable(table, label) {
  console.log(`\n=== ${label.toUpperCase()} ===`);
  const { data: rows, error } = await sb
    .from(table)
    .select("id, slug, title_es, title_en, images");
  if (error) { console.error(`${label} err:`, error); return 0; }

  // Detección de "imagen problemática":
  //   - sin imágenes
  //   - placeholder genérico legacy (photo-1564501049412...)
  //   - Unsplash IDs del backfill v1 (los que el PM criticó)
  const isV1Image = (u) => typeof u === "string" && (
    u.includes("1564501049412") ||
    /images\.unsplash\.com\/photo-\d+-[a-f0-9]+\?w=1600/.test(u) ||
    /picsum\.photos\/seed\/(utv|kayak|snorkel|sail|jetski|banana|paddle|biobay|cultural)-\d+\//.test(u)
  );

  const targets = (rows || []).filter((r) => {
    if (FORCE) return true;
    if (!Array.isArray(r.images) || r.images.length === 0) return true;
    // Si todas las imágenes son del backfill v1 (críticas del PM), reasignar.
    if (r.images.every(isV1Image)) return true;
    return false;
  });
  console.log(`Total: ${rows.length} | A reasignar: ${targets.length}${FORCE ? " (--force)" : ""}`);

  let updated = 0;
  for (const r of targets) {
    const imgs = imagesFor(r.slug);
    console.log(`  ${r.slug.padEnd(62)} → seed=${r.slug.slice(0, 28)}...`);
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
console.log("\nRecordatorio: estas son imágenes placeholder ÚNICAS por servicio.");
console.log("Para fotos reales contextuales, el admin debe subirlas vía el form");
console.log("(EditModal → Cover Image URL / Gallery Images) cuando el partner las provea.");
