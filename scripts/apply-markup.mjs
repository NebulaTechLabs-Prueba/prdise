/**
 * Aplica un sobreprecio (markup) a stays y/o tours.
 *
 * PM 2026-06-15 — solicitud inicial:
 *   El cliente cobra un 20% adicional sobre el precio neto del partner
 *   (Aventureo PR pidió eso explícitamente; por consistencia se aplica a
 *   TODOS los servicios existentes). Este script es one-shot: setea
 *   markup_type='percent', markup_value=20 en los servicios.
 *
 *   No toca price_cents (el base) — sólo escribe las columnas markup_*.
 *   El mapper en el front recomputa el precio efectivo = base * (1 + 20/100).
 *
 *   Por defecto NO sobrescribe servicios que ya tienen markup configurado
 *   (admin curó manualmente). Pasar --force para sobrescribir todos.
 *
 *   NO toca transfers (directiva del PM).
 *
 * Uso:
 *   node --env-file=.env.local scripts/apply-markup.mjs                    # 20% a faltantes
 *   node --env-file=.env.local scripts/apply-markup.mjs --pct 15           # 15% a faltantes
 *   node --env-file=.env.local scripts/apply-markup.mjs --pct 20 --force   # sobrescribe todos
 *   node --env-file=.env.local scripts/apply-markup.mjs --dry-run
 */

import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const DRY = args.includes("--dry-run");
const pctIdx = args.findIndex((a) => a === "--pct");
const PCT = pctIdx !== -1 && args[pctIdx + 1] ? Number(args[pctIdx + 1]) : 20;
if (!Number.isFinite(PCT) || PCT < -100 || PCT > 1000) {
  console.error(`--pct fuera de rango (-100 a 1000): ${PCT}`);
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const sb = createClient(url, key);

async function applyTo(table, label) {
  console.log(`\n=== ${label.toUpperCase()} ===`);
  const { data: rows, error } = await sb
    .from(table)
    .select("id, slug, price_cents, markup_type, markup_value");
  if (error) { console.error(`${label} err:`, error); return 0; }

  const targets = (rows || []).filter((r) => {
    if (FORCE) return true;
    return r.markup_type == null;
  });
  console.log(`Total: ${rows.length} | A aplicar ${PCT}%: ${targets.length}${FORCE ? " (--force)" : ""}`);

  let updated = 0;
  for (const r of targets) {
    const baseUsd = (r.price_cents || 0) / 100;
    const effectiveUsd = baseUsd * (1 + PCT / 100);
    const prevMarkup = r.markup_type
      ? `${r.markup_type}=${r.markup_value}`
      : "(sin markup)";
    console.log(`  ${r.slug.padEnd(60)} base=$${baseUsd.toFixed(2)} → final=$${effectiveUsd.toFixed(2)}  [prev: ${prevMarkup}]`);
    if (DRY) continue;
    const { error: upErr } = await sb
      .from(table)
      .update({ markup_type: "percent", markup_value: PCT })
      .eq("id", r.id);
    if (upErr) console.error(`     ! error: ${upErr.message}`);
    else updated++;
  }
  console.log(`${label}: actualizados ${updated}/${targets.length}.`);
  return updated;
}

const stays = await applyTo("stays", "Stays");
const tours = await applyTo("tours", "Tours");
console.log(`\n${DRY ? "[DRY-RUN] " : ""}Total: ${stays + tours} servicios con markup ${PCT}%.`);
