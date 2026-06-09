/**
 * Inspecciona el Excel del catálogo del cliente con detección de:
 *  - Filas de partner header (formato: "NAME — desc (zone) | url | phone")
 *  - Filas de servicio (con #, name, desc, price, etc.)
 *  - Asocia cada servicio al partner inmediato anterior.
 *
 * Read-only. Imprime un resumen + JSON estructurado por partner.
 *
 * Uso:  node scripts/inspect-catalog.mjs [path-al-xlsx]
 */
import { readFileSync } from "node:fs";
import XLSX from "xlsx";

const path = process.argv[2] || "docs/PRDISE_Partner_Services_Catalog.xlsx";
const wb = XLSX.read(readFileSync(path), { type: "buffer" });
const sheet = wb.Sheets[wb.SheetNames[0]];

// Reparseamos con range=2 para saltar (a) la fila título "LIVING IN PRDISE
// — Partner Services Catalog" y (b) la fila de headers reales (#, SERVICE
// NAME, ...). Damos nombres de columnas explícitos para no depender del
// auto-detect de xlsx (que genera __EMPTY*).
const COLS = ["num", "name", "description", "price", "unit", "duration", "ages", "includes", "booking_method", "notes"];
const raw = XLSX.utils.sheet_to_json(sheet, {
  defval: null,
  raw: true,
  range: 2,
  header: COLS,
});

console.log(`Archivo: ${path}`);
console.log(`Filas crudas (excluyendo header): ${raw.length}`);
console.log("");

// Detección: una fila es PARTNER HEADER si tiene texto en la primera columna
// pero null en SERVICE NAME / DESCRIPTION / PRICE. Una fila es SERVICE si
// tiene número/string en # y campos poblados.
const partnerHeaderRe = /^\s*(.+?)\s+[—–-]\s+(.+?)\s*(?:\(([^)]+)\))?\s*(?:\|\s*([^|]+?)\s*)?(?:\|\s*([^|]+?)\s*)?$/;

const partners = [];
let currentPartner = null;

for (const row of raw) {
  const num = row.num;
  const name = row.name;
  // El título de partner vive en la primera columna ("num") cuando las
  // otras están null. Detectamos así:
  const isPartnerHeader = num != null && typeof num === "string" && name == null && row.description == null && row.price == null;
  if (isPartnerHeader) {
    const m = String(num).trim().match(partnerHeaderRe);
    let pName = String(num).trim();
    let pDesc = null;
    let pZone = null;
    let pUrl = null;
    let pPhone = null;
    if (m) {
      pName = m[1]?.trim() || pName;
      pDesc = m[2]?.trim() || null;
      pZone = m[3]?.trim() || null;
      // m[4] y m[5] son los pipes "| url | phone"
      const piped = [m[4], m[5]].filter(Boolean).map((s) => s.trim());
      for (const piece of piped) {
        if (/^https?:/.test(piece) || /\.(com|net|org|io|co)\b/i.test(piece)) pUrl = piece;
        else if (/\d{3}/.test(piece)) pPhone = piece;
      }
    }
    currentPartner = {
      name: pName,
      description: pDesc,
      zone: pZone,
      url: pUrl,
      phone: pPhone,
      services: [],
    };
    partners.push(currentPartner);
    continue;
  }
  const isService = num != null && (typeof num === "number" || /^\d+$/.test(String(num).trim())) && name != null;
  if (isService) {
    if (!currentPartner) {
      console.warn(`Servicio sin partner: ${name}`);
      continue;
    }
    currentPartner.services.push({
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
    continue;
  }
  // resto: separadores o filas vacías → ignorar
}

console.log("═".repeat(72));
console.log(`PARTNERS detectados: ${partners.length}`);
console.log("═".repeat(72));
let totalServices = 0;
for (const p of partners) {
  totalServices += p.services.length;
  console.log("");
  console.log(`▸ ${p.name}`);
  if (p.zone) console.log(`   zona:  ${p.zone}`);
  if (p.url) console.log(`   url:   ${p.url}`);
  if (p.phone) console.log(`   tel:   ${p.phone}`);
  console.log(`   servicios: ${p.services.length}`);
  for (const s of p.services) {
    console.log(`     [${s.idx}] ${s.name}  ·  ${s.price ?? "—"} / ${s.unit ?? "—"}  ·  ${s.duration ?? "—"}`);
  }
}
console.log("");
console.log("═".repeat(72));
console.log(`TOTALES: ${partners.length} partners · ${totalServices} servicios`);
console.log("═".repeat(72));
