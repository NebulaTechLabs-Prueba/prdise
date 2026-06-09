/**
 * Importa el catálogo de partners + servicios desde el Excel del cliente
 * (docs/PRDISE_Partner_Services_Catalog.xlsx) a Supabase.
 *
 * Idempotente:
 *   - partners: upsert por slug (regenera el slug del name).
 *   - tours:    upsert por slug. Si ya existe un tour con ese slug, se
 *               actualizan los campos pero NO se cambia el partner_id ni
 *               el rating_avg/rating_count (preservación).
 *
 * Convenciones:
 *   - price_cents = 0  ⇒  precio "A consultar" (TBD). El frontend interpreta
 *     ese valor como tal y muestra el badge correspondiente.
 *   - Texto en EN: copiamos a _es como fallback; el admin traduce después.
 *
 * Filtros:
 *   - Se ignoran filas "partner" que sean disclaimer ("Note: ...") o el
 *     propio negocio ("Living in PRDISE") sin servicios.
 *
 * Uso:
 *   $ node scripts/import-catalog.mjs            # importa real
 *   $ node scripts/import-catalog.mjs --dry      # solo imprime, no escribe
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";

const DRY = process.argv.includes("--dry");
const XLSX_PATH = process.argv.find((a) => !a.startsWith("-") && a.endsWith(".xlsx"))
  || "docs/PRDISE_Partner_Services_Catalog.xlsx";

// ─── Env ───────────────────────────────────────────────────────────────────
const env = Object.fromEntries(
  readFileSync(join(process.cwd(), ".env.local"), "utf8")
    .split("\n").filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("Falta NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}
const supa = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ─── Helpers ───────────────────────────────────────────────────────────────
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 100);
}

// Extrae el primer número como precio en centavos. Casos:
//   "From $75"       → 7500
//   "$99 / $79 kids" → 9900
//   "$1,775"         → 177500   (coma = miles, 3 dígitos después)
//   "$493.92"        → 49392    (punto = decimal, 2 dígitos)
//   "TBD" / vacío    → 0        (convención "a consultar")
function parsePriceCents(raw) {
  if (raw == null) return 0;
  const s = String(raw);
  if (/tbd|consult|n\/a|tba/i.test(s)) return 0;
  // Capturamos número con posible separador de miles + decimal opcional:
  // grupos: int + ("," | ".") + int de 3 (miles) ó 1-2 (decimal).
  const m = s.match(/(\d{1,3}(?:[,.]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)/);
  if (!m) return 0;
  let token = m[1];
  // Detectar si tiene separador de miles (3 dígitos exactos después de , o .)
  // y un decimal distinto al final.
  // Heurística simple: la última secuencia tras separador de 1-2 dígitos
  // es decimal; de 3 dígitos es miles.
  // Normalizamos a formato JS: removemos separadores de miles, dejamos punto decimal.
  // Detectar último separador y su longitud.
  const lastSepIdx = Math.max(token.lastIndexOf(","), token.lastIndexOf("."));
  if (lastSepIdx === -1) {
    const n = Number(token);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
  }
  const lastSep = token[lastSepIdx];
  const afterLast = token.slice(lastSepIdx + 1).length;
  let normalized;
  if (afterLast === 3) {
    // Es separador de miles. Quitamos TODOS los separadores.
    normalized = token.replace(/[,.]/g, "");
  } else {
    // Es decimal. Quitamos los otros separadores y dejamos el último como punto.
    const beforeLast = token.slice(0, lastSepIdx).replace(/[,.]/g, "");
    const afterStr = token.slice(lastSepIdx + 1);
    normalized = `${beforeLast}.${afterStr}`;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

// Duración "2 hours" → 120, "Full day" → 480, "1.5 hours" → 90.
function parseDurationMinutes(raw) {
  if (raw == null) return 60;
  const s = String(raw).toLowerCase();
  if (/full\s*day/.test(s)) return 480;
  if (/half\s*day/.test(s)) return 240;
  const hours = s.match(/(\d+(?:\.\d+)?)\s*h(?:our|r)?s?/);
  if (hours) return Math.round(Number(hours[1]) * 60);
  const minMatch = s.match(/(\d+)\s*min/);
  if (minMatch) return Number(minMatch[1]);
  // Patrón "2-2.5 hours" → tomamos el mayor
  const range = s.match(/(\d+(?:\.\d+)?)\s*[-–]\s*(\d+(?:\.\d+)?)\s*h/);
  if (range) return Math.round(Number(range[2]) * 60);
  // "1 ride" / "1 ticket" / "Varies"
  return 60;
}

function ensureUrl(u) {
  if (!u) return null;
  const s = String(u).trim();
  if (!s) return null;
  if (/^https?:\/\//i.test(s)) return s;
  // Si empieza con email (info@…) o tel, no es URL
  if (s.includes("@") && !s.includes("//")) return null;
  return `https://${s}`;
}

// ─── Parse XLSX ────────────────────────────────────────────────────────────
const wb = XLSX.read(readFileSync(XLSX_PATH), { type: "buffer" });
const sheet = wb.Sheets[wb.SheetNames[0]];
const COLS = ["num", "name", "description", "price", "unit", "duration", "ages", "includes", "booking_method", "notes"];
const raw = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: true, range: 2, header: COLS });

// Acepta emojis, símbolos y espacios antes del nombre del partner.
const partnerHeaderRe = /^[^A-Za-z0-9ÁÉÍÓÚÑÜáéíóúñü]*(.+?)\s+[—–-]\s+(.+?)\s*(?:\(([^)]+)\))?\s*(?:\|\s*([^|]+?)\s*)?(?:\|\s*([^|]+?)\s*)?$/;
// Strip leading non-alphanumerics (emojis, espacios, variation selectors).
function cleanPartnerName(s) {
  return String(s || "").replace(/^[^A-Za-z0-9ÁÉÍÓÚÑÜáéíóúñü"]+/, "").trim();
}

const partners = [];
let cur = null;
for (const row of raw) {
  const num = row.num;
  const name = row.name;
  const isPartnerHeader = num != null && typeof num === "string" && name == null && row.description == null && row.price == null;
  if (isPartnerHeader) {
    const m = String(num).trim().match(partnerHeaderRe);
    let pName = cleanPartnerName(num);
    let pDesc = null, pZone = null, pUrl = null, pPhone = null;
    if (m) {
      pName = cleanPartnerName(m[1] || pName);
      pDesc = m[2]?.trim() || null;
      pZone = m[3]?.trim() || null;
      const pieces = [m[4], m[5]].filter(Boolean).map((s) => s.trim());
      for (const p of pieces) {
        if (/^https?:|\.(com|net|org|io|co|info)\b/i.test(p) && !p.includes("@")) pUrl = p;
        else if (/\d{3}.*\d{3}/.test(p)) pPhone = p;
      }
    }
    cur = { name: pName, description: pDesc, zone: pZone, url: pUrl, phone: pPhone, services: [] };
    partners.push(cur);
    continue;
  }
  const isService = num != null && (typeof num === "number" || /^\d+$/.test(String(num).trim())) && name != null;
  if (isService && cur) {
    cur.services.push({
      idx: Number(num),
      name,
      description: row.description,
      price: row.price,
      unit: row.unit,
      duration: row.duration,
      ages: row.ages,
      includes: row.includes,
      booking_method: row.booking_method,
      notes: row.notes,
    });
  }
}

// ─── Filtros: descartar disclaimers y partners propios sin servicios ──────
function isJunkPartner(p) {
  if (!p) return true;
  const n = (p.name || "").toLowerCase();
  if (n.startsWith("note:") || n.startsWith("nota:")) return true;
  if (n.includes("living in prdise") && p.services.length === 0) return true;
  return false;
}
const cleaned = partners.filter((p) => !isJunkPartner(p));

console.log(`Detectados: ${partners.length} partners crudos → ${cleaned.length} válidos`);
console.log(`Servicios totales: ${cleaned.reduce((s, p) => s + p.services.length, 0)}`);
console.log(`Modo: ${DRY ? "DRY-RUN (no escribe)" : "ESCRIBIR a Supabase"}`);
console.log("");

// ─── Upsert partners ──────────────────────────────────────────────────────
let partnersOk = 0, partnersErr = 0;
const partnerIdBySlug = new Map();
for (const p of cleaned) {
  const slug = slugify(p.name);
  if (!slug) { console.warn(`Skip partner sin slug: ${p.name}`); continue; }
  const zoneSuffix = p.zone ? `\nZona: ${p.zone}` : "";
  const phoneSuffix = p.phone ? `\nTel: ${p.phone}` : "";
  const notes = (p.description || "") + zoneSuffix + phoneSuffix;
  // Fallback de base_url: si el partner no tiene web propia, usamos el
  // WhatsApp del partner; si tampoco hay, el WhatsApp de PRDISE (el cliente
  // hace inquiry vía nuestro canal). El schema exige base_url not null.
  const PRDISE_WA = "https://wa.me/17872379519";
  let baseUrl = ensureUrl(p.url);
  if (!baseUrl && p.phone) {
    const digits = String(p.phone).replace(/\D/g, "");
    if (digits.length >= 7) baseUrl = `https://wa.me/${digits.length === 10 ? "1" + digits : digits}`;
  }
  if (!baseUrl) baseUrl = PRDISE_WA;
  const payload = {
    slug,
    name: p.name,
    base_url: baseUrl,
    contact_phone: p.phone || null,
    notes_es: notes.trim() || null,
    notes_en: notes.trim() || null,
    utm_source: "prdise",
    active: true,
  };
  if (DRY) {
    console.log(`[DRY] partner ${slug}`, JSON.stringify(payload).slice(0, 140));
    partnerIdBySlug.set(slug, `dry-${slug}`);
    partnersOk++;
    continue;
  }
  const { data, error } = await supa.from("partners")
    .upsert(payload, { onConflict: "slug" })
    .select("id, slug")
    .single();
  if (error) {
    console.error(`✗ partner ${slug}: ${error.message}`);
    partnersErr++;
    continue;
  }
  partnerIdBySlug.set(slug, data.id);
  partnersOk++;
}

console.log("");
console.log(`Partners: ${partnersOk} OK, ${partnersErr} errores`);
console.log("");

// ─── Upsert tours ─────────────────────────────────────────────────────────
let toursOk = 0, toursErr = 0, toursSkip = 0;
for (const p of cleaned) {
  const pSlug = slugify(p.name);
  const partnerId = partnerIdBySlug.get(pSlug);
  if (!partnerId) { console.warn(`Skip tours de partner sin id: ${p.name}`); continue; }
  for (const s of p.services) {
    const slug = slugify(`${p.name}-${s.name}`);
    if (!slug) { toursSkip++; continue; }
    const priceCents = parsePriceCents(s.price);
    const durationMin = parseDurationMinutes(s.duration);
    const includesArr = (s.includes || "")
      .split(/[,;]/).map((x) => x.trim()).filter(Boolean);
    // Construimos description rico: original + metadata útil para el cliente.
    const descParts = [];
    if (s.description) descParts.push(s.description);
    const meta = [];
    if (s.price) meta.push(`Precio: ${s.price}${s.unit ? " " + s.unit : ""}`);
    if (s.duration) meta.push(`Duración: ${s.duration}`);
    if (s.ages) meta.push(`Edades: ${s.ages}`);
    if (s.booking_method) meta.push(`Reservas: ${s.booking_method}`);
    if (s.notes) meta.push(`Notas: ${s.notes}`);
    if (meta.length) descParts.push("\n" + meta.join("\n"));
    const description = descParts.join("\n").trim();
    const payload = {
      slug,
      title_es: s.name,
      title_en: s.name,
      short_desc_es: s.description || null,
      short_desc_en: s.description || null,
      description_es: description || null,
      description_en: description || null,
      location: p.zone || null,
      duration_minutes: durationMin,
      max_pax: 10,
      price_cents: priceCents,
      includes: includesArr,
      images: [],
      featured: false,
      active: true,
      partner_id: partnerId === `dry-${pSlug}` ? null : partnerId,
      partner_url: ensureUrl(p.url),
    };
    if (DRY) {
      console.log(`[DRY] tour ${slug}  (price ${priceCents/100}, dur ${durationMin}m)`);
      toursOk++;
      continue;
    }
    const { error } = await supa.from("tours").upsert(payload, { onConflict: "slug" });
    if (error) {
      console.error(`✗ tour ${slug}: ${error.message}`);
      toursErr++;
      continue;
    }
    toursOk++;
  }
}

console.log("");
console.log(`Tours: ${toursOk} OK, ${toursErr} errores, ${toursSkip} sin slug`);
console.log("");
console.log("✓ Import finalizado");
