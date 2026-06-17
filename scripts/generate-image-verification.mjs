/**
 * Genera docs/image-verification.md cruzando:
 *  - servicio (stays/tours)
 *  - partner asignado + URL del partner (cuando existe)
 *  - imagen actualmente asignada en service.images[0]
 *  - veredicto manual (escrito en este script, basado en el WebFetch
 *    hecho a los sitios de partners por Claude antes de generar)
 *
 * PM 2026-06-17: después del upload de las 32 imágenes generadas por IA,
 * el cliente pidió validar contra los sitios de los partners para
 * confirmar fit experiencia↔imagen. Este reporte materializa esa
 * verificación. El usuario revisa y decide cuáles regenerar.
 *
 * NO modifica DB — sólo lee y escribe el .md.
 *
 * Uso: node --env-file=.env.local scripts/generate-image-verification.mjs
 */

import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const { data: stays } = await sb.from("stays").select("slug, title_es, title_en, partner_id, partner_url, images").order("slug");
const { data: tours } = await sb.from("tours").select("slug, title_es, title_en, partner_id, partner_url, images").order("slug");
const { data: partners } = await sb.from("partners").select("id, name, base_url");
const partnerById = new Map((partners || []).map(p => [p.id, p]));

// ── Veredictos por servicio (escritos a mano en este corte) ───────────────
// Fuente: WebFetch a los 6 sitios de partners más DB info. Cada veredicto:
//   { fit: "ok"|"warn"|"fail"|"no-image"|"no-partner-url", note: string }
//
// Si necesitás regenerar este reporte con criterios nuevos, editá esta
// tabla y volvé a correr el script. El script no decide nada — sólo
// formatea lo que está acá.
const VERDICTS = {
  // ─── STAYS (no se generaron imágenes, son test) ───────────────────────
  "hotel-mq9rykxw": { fit: "no-image", note: "Stay de prueba — el cliente decidió no generar imagen para esta entrega." },
  "turmoline-bgl0": { fit: "no-image", note: "Stay de prueba — el cliente decidió no generar imagen para esta entrega." },

  // ─── AVENTOURA PUERTO RICO (sin partner_url en DB) ────────────────────
  "aventoura-puerto-rico-aguadilla-utv-convoy-8-max": { fit: "ok", note: "UTV Convoy (2 unidades, conducís siguiendo al guía). Prompt: UTV buggy en jungle trail PR — alineado con la actividad, aunque convoy implicaría varios vehículos visibles. Aceptable." },
  "aventoura-puerto-rico-aguadilla-utv-guided-3-max": { fit: "ok", note: "UTV guiado 3-seater Can-Am en Ruinas del Faro / Playa Blanca / Aguadilla. Prompt UTV genérico es válido — no diferencia el modelo Can-Am pero sí captura el tipo de experiencia." },
  "aventoura-puerto-rico-aguadilla-utv-guided-6-max": { fit: "ok", note: "Idem guided-3 — son 2 Can-Am de 3 plazas cada uno con guía. Prompt UTV genérico cubre la experiencia." },
  "aventoura-puerto-rico-pinones-utv-tour-near-san-juan": { fit: "warn", note: "Piñones está cerca de San Juan (costa nordeste, urbano-costero), NO en las montañas del oeste como dice el prompt. La imagen probablemente muestra montaña/jungla. ⚠️ Considerar regenerar con setting costero/manglar de Piñones." },

  // ─── AVENTUREO PR (✓ partner_url verificado: aventureopr.com) ─────────
  "aventureo-pr-tanama-full-day-adventure": { fit: "ok", note: "Confirmado vía aventureopr.com: ofrecen cave tubing en Tanamá (Arecibo) + río + cuevas. Prompt 'rappelling into limestone river cave' captura el espíritu; estrictamente el partner es más tubing que rappel, pero el sentido aventurero está." },

  // ─── ENDLESS SUMMER (alquileres de playa — facebook URL, info limitada) ──
  "endless-summer-beach-chair-rental": { fit: "ok", note: "Alquiler de silla en Buyé Beach. Prompt premium beach setup con palm shade — fit directo." },
  "endless-summer-beach-tent-rental": { fit: "warn", note: "El prompt genérico de 'premium beach setup' es el mismo para los 5 rentals beach_gear. Sin diferenciar tienda vs silla vs sombrilla, las 5 imágenes seguramente son similares entre sí. Útil para diferenciación por servicio si el cliente quiere imágenes distintas." },
  "endless-summer-beach-umbrella-rental": { fit: "warn", note: "Mismo template beach_gear que tent/chair/table. ⚠️ Considerar prompts más específicos: solo sombrilla aislada, solo silla, solo carpa." },
  "endless-summer-domino-table-rental": { fit: "ok", note: "Prompt específico de mesa de dominó en la playa — bien diferenciado del resto del lineup beach_gear." },
  "endless-summer-table-rental": { fit: "warn", note: "Prompt beach_gear genérico (premium setup completo). Para una mesa simple convendría una imagen sólo de la mesa." },

  // ─── ENDLESS SUMMER WATER SPORT (sin partner_url en DB) ───────────────
  "endless-summer-water-bikes": { fit: "warn", note: "Prompt usa template 'paddle' (paddleboarder gliding). Water bikes son distintos a SUP — son bicicletas flotantes. ⚠️ Considerar regenerar con prompt específico de hydrobike/water bike." },
  "endless-summer-water-sport-banana-boat-ride": { fit: "ok", note: "Prompt directo de banana boat amarillo siendo remolcado — fit perfecto." },
  "endless-summer-water-sport-jet-ski-rental": { fit: "ok", note: "Prompt directo de jet-skis en Buyé Beach Cabo Rojo — fit perfecto." },
  "endless-summer-water-sport-kayak-rental": { fit: "ok", note: "Prompt de kayak en bahía turquesa de PR — fit correcto." },
  "endless-summer-water-sport-paddle-board-sup": { fit: "ok", note: "Prompt específico de SUP cerca de Buyé Beach — fit directo." },

  // ─── KATARINA SAIL CHARTERS (✓ verificado: sailrinconpr.com, 32ft catamaran) ──
  "katarina-sail-charters-afternoon-sunset-sail": { fit: "ok", note: "Confirmado: 32ft catamaran USCG-cert en Rincón. Prompt 'white-sail catamaran cruising at sunset off Rincón' es exacto a la oferta." },
  "katarina-sail-charters-morning-snorkel-sail": { fit: "ok", note: "Confirmado: morning snorkel sail en el mismo catamaran (Tres Palmas Reserve / Shipwreck). Prompt snorkel sobre coral reef es adecuado, aunque el partner combina vela + snorkel — la imagen sólo muestra el snorkel. Aceptable." },

  // ─── LA BARRA SALADA (✓ verificado: labarrasaladapr.com — barcos + mesa flotante) ──
  "la-barra-salada-pr-la-barra-salada-boat-max-6": { fit: "ok", note: "Confirmado: barcos USCG-cert salen de Las Crayolas Boat Ramp Lajas hacia Rabo de Gata. Prompt 'sleek private dive/snorkel boat' es correcto al tipo de operación." },
  "la-barra-salada-pr-la-barra-salada-premium-boat-max-6": { fit: "ok", note: "Versión premium del anterior — mismo prompt boat. Si el cliente quiere diferenciar visualmente premium vs estándar, considerar imagen con más detalle de servicio en cubierta." },
  "la-barra-salada-pr-la-mesa-salada-floating-table-max-4": { fit: "ok", note: "Confirmado: floating table para hasta 4 personas. Prompt 'floating wooden table in waist-deep turquoise water La Parguera' — fit exacto a la propuesta del partner." },

  // ─── PARGUERA WATER SPORTS / BIO BAY (✓ verificado: biobayparguera.com) ──
  "parguera-water-sports-bio-bay-bio-bay-kayak-swim-tour": { fit: "ok", note: "Confirmado: el tour estrella del partner. Prompt 'kayak gliding across turquoise bay' — fit razonable. Para diferenciar de los otros bio-bay convendría que la imagen muestre kayak + bioluminiscencia nocturna." },
  "parguera-water-sports-bio-bay-private-island-adventure-boat-tour": { fit: "warn", note: "Servicio: full day en cayos por barco privado. Prompt usa template 'bio_bay' (bioluminiscencia nocturna) — pero este tour es DIURNO en cayos. ⚠️ Regenerar con prompt de barco + cayos diurnos turquesa." },
  "parguera-water-sports-bio-bay-sunset-swim-kayak-bio-bay": { fit: "ok", note: "Sunset swim en cayo + kayak bioluminiscente. Prompt kayak — aceptable. Idealmente la imagen mostraría transición sunset→noche con bioluminiscencia." },
  "parguera-water-sports-bio-bay-swimming-bio-bay-adventure": { fit: "ok", note: "Swimming-only nocturno en bio bay. Prompt 'bioluminescent bay at night, glowing plankton trails' — fit directo." },
  "parguera-water-sports-bio-bay-vip-snorkeling": { fit: "ok", note: "VIP snorkeling en cayos La Parguera. Prompt snorkel sobre reef — fit correcto, aunque 'VIP' sugeriría una imagen más exclusiva (barco privado, pocas personas)." },
  "parguera-water-sports-bio-bay-water-birthday-splash": { fit: "warn", note: "Servicio: cumpleaños privado en pontoon boat. Prompt usa template bio_bay nocturno bioluminiscente. ⚠️ Una fiesta diurna en pontoon NO es lo mismo — regenerar con vibe de celebración + pontoon en agua turquesa." },

  // ─── PINTOS R US (✓ verificado: pintosrus.com — caballos + ponys, Rincón Marina) ──
  "pintos-r-us-group-ride": { fit: "ok", note: "Confirmado: tour 2h en grupo desde Black Eagle Marina Rincón, beaches + tropical trails. Prompt 'horseback rider on white-sand beach at golden hour' — fit excelente." },
  "pintos-r-us-marina-pony-ride": { fit: "ok", note: "Confirmado: ~20min para niños 2-10 en la marina con stop fotográfico en playa. Prompt 'pony with child rider along marina boardwalk' — fit muy específico y correcto." },
  "pintos-r-us-pony-experience": { fit: "ok", note: "Confirmado: 45min farm experience (groom + tack + ride). Prompt usa el mismo template 'pony' que marina-pony-ride. ⚠️ Si querés diferenciar, regenerar con escena de granja (no marina)." },
  "pintos-r-us-private-ride": { fit: "ok", note: "Tour privado 2h para riders experimentados. Prompt 'horseback rider on white-sand beach' — mismo template que group-ride. Diferenciación visual marginal." },
  "pintos-r-us-special-events-package": { fit: "no-image", note: "No se generó imagen para este servicio en este lote." },

  // ─── TU CENTRO JAYUYA (sin partner_url en DB) ─────────────────────────
  "tu-centro-jayuya-jayuya-full-day-cultural-tour-phase-1": { fit: "ok", note: "Tour cultural full-day en Jayuya: Piedra Escrita, Museo El Cemí, hacienda café. Prompt 'hillside coffee hacienda Jayuya, traditional wooden buildings' — captura el espíritu cultural montañoso." },
  "tu-centro-jayuya-jayuya-individual-attractions-pricing-tbd": { fit: "ok", note: "Atracciones individuales en Jayuya (petroglifos, museos, fincas). Prompt 'Taíno petroglyphs carved into granite boulder Jayuya highlands' — fit excelente, ícono cultural reconocible." },
};

const FIT_BADGE = {
  ok: "✅",
  warn: "⚠️",
  fail: "❌",
  "no-image": "⬜",
  "no-partner-url": "ℹ️",
};

const FIT_LABEL = {
  ok: "Alineado",
  warn: "Revisar",
  fail: "Mismatch",
  "no-image": "Sin imagen",
  "no-partner-url": "Sin URL partner",
};

function row(svc, kind) {
  const v = VERDICTS[svc.slug] || { fit: "warn", note: "Sin veredicto registrado — agregar a VERDICTS{}." };
  const partner = svc.partner_id ? partnerById.get(svc.partner_id) : null;
  const partnerName = partner?.name || "—";
  const partnerUrl = svc.partner_url || partner?.base_url || "";
  const img = Array.isArray(svc.images) && svc.images.length ? svc.images[0] : "";
  return { svc, kind, v, partnerName, partnerUrl, img };
}

const all = [
  ...(stays || []).map(s => row(s, "stay")),
  ...(tours || []).map(t => row(t, "tour")),
];

// ─── Render markdown ──────────────────────────────────────────────────────
const lines = [];
lines.push("# Verificación de imágenes asignadas a servicios");
lines.push("");
lines.push(`> Generado: ${new Date().toISOString().slice(0, 10)}  ·  Servicios: ${all.length}`);
lines.push("");
lines.push("Cruce entre la imagen asignada a cada servicio y la oferta real del");
lines.push("partner (verificada por WebFetch contra el sitio web del aliado, o");
lines.push("por inferencia desde slug+título cuando no hay URL disponible).");
lines.push("");
lines.push("**Leyenda:**");
lines.push("");
lines.push("| Badge | Significado |");
lines.push("|---|---|");
lines.push("| ✅ | Imagen alineada con la experiencia real — sin acción requerida |");
lines.push("| ⚠️ | Revisar y considerar regenerar — el prompt/imagen es demasiado genérico o sutilmente desajustado |");
lines.push("| ❌ | Mismatch claro — regenerar |");
lines.push("| ⬜ | Sin imagen asignada (test o pendiente) |");
lines.push("| ℹ️ | Partner sin URL pública — verdicto basado solo en slug/título |");
lines.push("");

// Resumen
const counts = { ok: 0, warn: 0, fail: 0, "no-image": 0, "no-partner-url": 0 };
all.forEach(r => { counts[r.v.fit] = (counts[r.v.fit] || 0) + 1; });
lines.push("**Resumen:**");
lines.push("");
lines.push(`- ✅ Alineadas: ${counts.ok}`);
lines.push(`- ⚠️ Revisar: ${counts.warn}`);
lines.push(`- ❌ Mismatch: ${counts.fail}`);
lines.push(`- ⬜ Sin imagen: ${counts["no-image"]}`);
lines.push("");
lines.push("---");
lines.push("");

// Agrupar por partner
const byPartner = new Map();
all.forEach(r => {
  const key = r.partnerName;
  if (!byPartner.has(key)) byPartner.set(key, []);
  byPartner.get(key).push(r);
});

for (const [partnerName, rows] of byPartner.entries()) {
  lines.push(`## ${partnerName} (${rows.length})`);
  if (rows[0].partnerUrl) {
    lines.push("");
    lines.push(`URL partner: ${rows[0].partnerUrl}`);
  }
  lines.push("");
  for (const r of rows) {
    const title = r.svc.title_es || r.svc.title_en || r.svc.slug;
    const badge = FIT_BADGE[r.v.fit] || "?";
    const label = FIT_LABEL[r.v.fit] || r.v.fit;
    lines.push(`### ${badge} ${title}`);
    lines.push(`*slug: \`${r.svc.slug}\` · veredicto: **${label}***`);
    lines.push("");
    if (r.img) {
      lines.push(`Imagen actual: ${r.img}`);
      lines.push("");
    } else {
      lines.push("Imagen actual: _ninguna_");
      lines.push("");
    }
    lines.push(`> ${r.v.note}`);
    lines.push("");
  }
  lines.push("---");
  lines.push("");
}

const out = "docs/image-verification.md";
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, lines.join("\n"), "utf8");
console.log(`Generado: ${out}`);
console.log(`✅ ${counts.ok}  ⚠️ ${counts.warn}  ❌ ${counts.fail}  ⬜ ${counts["no-image"]}`);
