/**
 * Asigna imágenes locales (assets/service-images/) a los servicios de DB
 * usando el slug como llave de matching.
 *
 * PM 2026-06-17: el cliente generó imágenes contextuales a partir de
 * docs/image-prompts.md y necesita un canal para subirlas en lote y que
 * reemplacen los placeholders Picsum del backfill anterior.
 *
 * Convención de archivos en assets/service-images/:
 *   {slug}.{jpg|jpeg|png|webp}
 *
 * Flujo por archivo:
 *   1. Extrae slug del basename del archivo.
 *   2. Busca servicio matching (stays o tours) por slug.
 *   3. Sube el archivo a Supabase Storage (bucket service-images), path
 *      determinístico: {kind}/{serviceId}/cover-uploaded-{epoch}.{ext}.
 *   4. Actualiza la columna images de la fila a [publicUrl] (1 cover, sin
 *      galería — el admin puede agregar gallery vía el form si quiere).
 *
 * NO toca transfers (vehicles/routes) — directiva PM.
 *
 * Uso:
 *   node --env-file=.env.local scripts/assign-service-images.mjs
 *   node --env-file=.env.local scripts/assign-service-images.mjs --dry-run
 *   node --env-file=.env.local scripts/assign-service-images.mjs --keep-gallery
 *
 * --keep-gallery: en vez de reemplazar todo images[], hace el upload como
 * cover (primera posición) y mantiene las imágenes anteriores como galería.
 */

import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, basename, join } from "node:path";

const DRY = process.argv.includes("--dry-run");
const KEEP_GALLERY = process.argv.includes("--keep-gallery");
const DROP_DIR = "assets/service-images";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const sb = createClient(url, key);

const VALID_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };

// 1) Inventario de archivos
let files;
try {
  files = readdirSync(DROP_DIR).filter((f) => !f.startsWith(".") && VALID_EXT.has(extname(f).toLowerCase()));
} catch (e) {
  console.error(`No se pudo leer ${DROP_DIR}:`, e.message);
  process.exit(1);
}
if (files.length === 0) {
  console.log(`No hay imágenes en ${DROP_DIR}. Dropea archivos {slug}.{jpg|png|webp} y volvé a correr.`);
  process.exit(0);
}
console.log(`Archivos detectados: ${files.length}\n`);

// 2) Inventario de servicios
const { data: stays, error: e1 } = await sb.from("stays").select("id, slug, images");
if (e1) { console.error("stays err:", e1); process.exit(1); }
const { data: tours, error: e2 } = await sb.from("tours").select("id, slug, images");
if (e2) { console.error("tours err:", e2); process.exit(1); }

const slugIndex = new Map();
(stays || []).forEach((r) => slugIndex.set(r.slug, { ...r, kind: "stay", table: "stays" }));
(tours || []).forEach((r) => slugIndex.set(r.slug, { ...r, kind: "tour", table: "tours" }));

// 3) Procesar cada archivo
const matched = [];
const orphaned = [];
for (const f of files) {
  const ext = extname(f).toLowerCase();
  const slug = basename(f, ext);
  const svc = slugIndex.get(slug);
  if (!svc) {
    orphaned.push(f);
    continue;
  }
  matched.push({ file: f, slug, ext, svc });
}

console.log(`Matched: ${matched.length}/${files.length}`);
if (orphaned.length) {
  console.log(`\nHuérfanos (sin servicio en DB):`);
  orphaned.forEach((f) => console.log(`  - ${f}`));
}
console.log("");

if (matched.length === 0) {
  console.log("Nada para hacer.");
  process.exit(0);
}

let uploaded = 0;
let failed = 0;
for (const m of matched) {
  const path = join(DROP_DIR, m.file);
  const buf = readFileSync(path);
  const sizeKb = Math.round(buf.length / 1024);
  const contentType = MIME[m.ext] || "image/jpeg";
  const storagePath = `${m.svc.kind}/${m.svc.id}/cover-uploaded-${Date.now().toString(36)}${m.ext}`;

  console.log(`▶ ${m.slug.padEnd(60)} (${sizeKb} KB → ${storagePath})`);

  if (DRY) { uploaded++; continue; }

  // Upload
  const { error: upErr } = await sb.storage
    .from("service-images")
    .upload(storagePath, buf, { cacheControl: "31536000", upsert: false, contentType });
  if (upErr) {
    console.error(`  ! upload err: ${upErr.message}`);
    failed++;
    continue;
  }

  // Public URL
  const { data: urlData } = sb.storage.from("service-images").getPublicUrl(storagePath);
  const publicUrl = urlData?.publicUrl;
  if (!publicUrl) {
    console.error(`  ! no public URL devuelta`);
    failed++;
    continue;
  }

  // Update images[]
  const nextImages = KEEP_GALLERY && Array.isArray(m.svc.images) && m.svc.images.length
    ? [publicUrl, ...m.svc.images.filter((u) => u !== publicUrl)]
    : [publicUrl];

  const { error: updErr } = await sb.from(m.svc.table).update({ images: nextImages }).eq("id", m.svc.id);
  if (updErr) {
    console.error(`  ! DB update err: ${updErr.message}`);
    failed++;
    continue;
  }

  uploaded++;
}

console.log(`\n${DRY ? "[DRY-RUN] " : ""}Subidos: ${uploaded}/${matched.length}. Fallos: ${failed}.`);
if (orphaned.length) {
  console.log(`\nRecordá: ${orphaned.length} archivo(s) huérfanos quedaron sin asignar (slug no matchea ningún servicio).`);
}
