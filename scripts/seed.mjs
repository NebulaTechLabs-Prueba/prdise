// ============================================================================
// Seed de la DB prdise. Idempotente — puede correrse múltiples veces.
//
//   node --env-file=.env.local scripts/seed.mjs
//
// Datos:
//   - 4 cuentas demo (admin, user, 2 employees) basadas en los fixtures del JSX
//   - 6 stays, 4 tours, 3 vehicles, 5 transfer_routes
//   - 3 posts de blog
//
// Las imágenes se guardan como identificadores cortos ("aerial-bay", "palm").
// La UI los mapea a las constantes IMG_* del PrdiseApp.jsx hasta que se migre
// a Supabase Storage.
// ============================================================================

import { createClient } from "@supabase/supabase-js";

const url     = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !service) {
  console.error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en .env.local");
  process.exit(1);
}

const sb = createClient(url, service, { auth: { persistSession: false } });

// ─── Cuentas demo ───────────────────────────────────────────────────────────
const DEMO_USERS = [
  { email: "admin@prdise.com",  password: "admin123",  role: "admin",    first_name: "Administrator", last_name: ""        },
  { email: "user@prdise.com",   password: "user123",   role: "user",     first_name: "María",         last_name: "López"   },
  { email: "carlos@prdise.com", password: "carlos123", role: "employee", first_name: "Carlos",        last_name: "Rivera",
    employee_id: "u2", position: "Receptionist",       department: "Front Desk" },
  { email: "ana@prdise.com",    password: "ana123",    role: "employee", first_name: "Ana",           last_name: "García",
    employee_id: "u3", position: "Accounting Manager", department: "Finance"    },
];

async function ensureUser(u) {
  // Si ya existe, listAll lo encontrará. createUser falla con email_exists si
  // ya está; lo capturamos y seguimos.
  const { data: existingList } = await sb.auth.admin.listUsers({ perPage: 200 });
  const existing = existingList?.users?.find((x) => x.email === u.email);
  let userId = existing?.id;

  if (!userId) {
    const { data, error } = await sb.auth.admin.createUser({
      email: u.email,
      password: u.password,
      email_confirm: true,
      user_metadata: { first_name: u.first_name, last_name: u.last_name },
    });
    if (error) throw new Error(`createUser ${u.email}: ${error.message}`);
    userId = data.user.id;
    console.log(`  + auth.users created: ${u.email}`);
  } else {
    console.log(`  = auth.users exists: ${u.email}`);
  }

  // Actualizar profile (el trigger handle_new_user lo creó con defaults).
  const profileUpdate = {
    first_name: u.first_name,
    last_name:  u.last_name,
    role:       u.role,
    status:     "active",
  };
  if (u.employee_id) profileUpdate.employee_id = u.employee_id;
  if (u.position)    profileUpdate.position    = u.position;
  if (u.department)  profileUpdate.department  = u.department;

  const { error: upErr } = await sb.from("profiles").update(profileUpdate).eq("id", userId);
  if (upErr) throw new Error(`update profile ${u.email}: ${upErr.message}`);
}

// ─── Stays ──────────────────────────────────────────────────────────────────
const STAYS = [
  { slug: "villa-blue-coral",       title_es: "Villa Blue Coral",        title_en: "Villa Blue Coral",
    short_desc_es: "Villa frente al mar a pasos de Playa Buyé, con piscina privada y vistas espectaculares al Caribe.",
    short_desc_en: "Beachfront villa steps from Buyé Beach with private pool and stunning Caribbean views.",
    location: "Playa Buyé, Cabo Rojo", lat: 18.0265, lng: -67.1697,
    price_cents: 24500, max_guests: 6, bedrooms: 3, bathrooms: 2, featured: true, active: true,
    amenities: ["WiFi","Pool","A/C","Beach Access","Kitchen","Parking","BBQ","Smart TV"],
    images: ["aerial-bay","palm","sunset-jetski","lighthouse"] },
  { slug: "combate-ocean-breeze",   title_es: "Combate Ocean Breeze",    title_en: "Combate Ocean Breeze",
    short_desc_es: "Apartamento frente al mar cerca del Faro de Cabo Rojo y la bahía bioluminiscente.",
    short_desc_en: "Oceanfront apartment near the Cabo Rojo Lighthouse and bio bay.",
    location: "Combate, Cabo Rojo", lat: 17.9720, lng: -67.1950,
    price_cents: 17500, max_guests: 4, bedrooms: 2, bathrooms: 1, featured: false, active: true,
    amenities: ["WiFi","Ocean View","A/C","Kitchen","Parking"],
    images: ["palm","sunset-jetski","lighthouse","aerial-bay"] },
  { slug: "boqueron-luxury-villa",  title_es: "Boquerón Luxury Villa",   title_en: "Boquerón Luxury Villa",
    short_desc_es: "Villa moderna a pasos de la famosa playa, bares y restaurantes de Boquerón.",
    short_desc_en: "Modern villa walking distance to Boquerón's famous beach, bars, and restaurants.",
    location: "Boquerón", lat: 18.0055, lng: -67.1710,
    price_cents: 19500, max_guests: 5, bedrooms: 2, bathrooms: 2, featured: true, active: true,
    amenities: ["WiFi","Smart TV","A/C","Walk to Beach","Kitchen","Washer"],
    images: ["sunset-jetski","palm","aerial-bay","zipline"] },
  { slug: "joyuda-seaside-retreat", title_es: "Joyuda Seaside Retreat",  title_en: "Joyuda Seaside Retreat",
    short_desc_es: "Casa frente al mar con muelle privado y atardeceres espectaculares.",
    short_desc_en: "Waterfront home with private dock and stunning sunset views.",
    location: "Joyuda", lat: 18.0710, lng: -67.1780,
    price_cents: 31000, max_guests: 8, bedrooms: 3, bathrooms: 3, featured: false, active: true,
    amenities: ["WiFi","Private Dock","BBQ","A/C","Kitchen","Kayaks","Parking","Pool"],
    images: ["van-road","aerial-bay","palm","lighthouse"] },
  { slug: "parguera-chalet",        title_es: "La Parguera Chalet",      title_en: "La Parguera Chalet",
    short_desc_es: "Chalet acogedor a 5 minutos de La Parguera y la bahía bioluminiscente.",
    short_desc_en: "Cozy chalet 5 minutes from La Parguera and the bioluminescent bay.",
    location: "La Parguera", lat: 17.9745, lng: -67.0460,
    price_cents: 13500, max_guests: 4, bedrooms: 2, bathrooms: 1, featured: false, active: true,
    amenities: ["WiFi","A/C","Kitchen","Parking"],
    images: ["mangroves","palm","van-road"] },
  { slug: "playa-azul-penthouse",   title_es: "Playa Azul Penthouse",    title_en: "Playa Azul Penthouse",
    short_desc_es: "Penthouse frente al mar con espectaculares vistas oceánicas desde la terraza.",
    short_desc_en: "Beachfront penthouse with spectacular rooftop ocean views.",
    location: "Punta Arenas, Cabo Rojo", lat: 18.0100, lng: -67.1680,
    price_cents: 28000, max_guests: 4, bedrooms: 2, bathrooms: 2, featured: false, active: false,
    amenities: ["WiFi","Rooftop","Beach Access","A/C","Kitchen","Smart TV","Pool"],
    images: ["lighthouse","aerial-bay","sunset-jetski","palm"] },
];

// ─── Tours ──────────────────────────────────────────────────────────────────
const TOURS = [
  { slug: "beach-escape",     title_es: "Escape a la Playa",   title_en: "Beach Escape",
    short_desc_es: "Descubre playas no turísticas con aguas turquesas. Nada, esnorquelea y relájate.",
    short_desc_en: "Discover non-touristy beaches with turquoise waters. Swim, snorkel, and relax.",
    location: "Playa Buyé, Cabo Rojo", meeting_point: "Hotel en San Juan",
    lat: 18.0265, lng: -67.1697,
    duration_minutes: 480, max_pax: 12, price_cents: 18500, difficulty: "Easy", featured: true, active: true,
    includes: ["Transporte ida y vuelta desde San Juan","Guía bilingüe","Equipo de snorkel","Almuerzo","Snacks y bebidas","Entradas"],
    images: ["aerial-bay","palm","sunset-jetski"] },
  { slug: "river-mountain",   title_es: "Río y Montaña",        title_en: "River & Mountain",
    short_desc_es: "Ríos prístinos, montañas frondosas, pozas naturales y senderos en bosque tropical.",
    short_desc_en: "Pristine rivers, lush mountains, natural pools and tropical forest trails.",
    location: "Bosque Estatal de Maricao", meeting_point: "Hotel en San Juan",
    lat: 18.1500, lng: -66.9800,
    duration_minutes: 540, max_pax: 12, price_cents: 19500, difficulty: "Moderate", featured: false, active: true,
    includes: ["Transporte ida y vuelta","Guía bilingüe","Equipo de hiking","Almuerzo tradicional","Agua y snacks"],
    images: ["zipline","van-road","mangroves"] },
  { slug: "sunset-flavor",    title_es: "Atardecer y Sabor",    title_en: "Sunset & Flavor",
    short_desc_es: "Atardecer en el Faro de Cabo Rojo acompañado de auténtica cocina local.",
    short_desc_en: "Cabo Rojo Lighthouse sunset paired with authentic local cuisine.",
    location: "Faro de Cabo Rojo", meeting_point: "Hotel en San Juan",
    lat: 17.9322, lng: -67.1953,
    duration_minutes: 600, max_pax: 12, price_cents: 21000, difficulty: "Easy", featured: true, active: true,
    includes: ["Transporte ida y vuelta","Guía bilingüe","Cena de 3 platos","Maridaje de vinos","Snacks"],
    images: ["lighthouse","sunset-jetski","aerial-bay"] },
  { slug: "bio-bay-kayak",    title_es: "Kayak Bahía Bio",      title_en: "Bio Bay Kayak",
    short_desc_es: "Kayak nocturno por canales de manglares bioluminiscentes.",
    short_desc_en: "Night kayak through bioluminescent mangrove channels.",
    location: "La Parguera", meeting_point: "Marina La Parguera",
    lat: 17.9745, lng: -67.0460,
    duration_minutes: 300, max_pax: 16, price_cents: 14500, difficulty: "Easy", featured: false, active: false,
    includes: ["Transporte ida y vuelta","Kayak y equipo","Guía bilingüe","Snacks"],
    images: ["mangroves","van-road","aerial-bay"] },
];

// ─── Vehicles ───────────────────────────────────────────────────────────────
const VEHICLES = [
  { name: "Sedan",       type: "sedan", max_pax: 3,  max_luggage: 2,  price_cents: 12000, image: "sedan", active: true },
  { name: "SUV",         type: "suv",   max_pax: 5,  max_luggage: 4,  price_cents: 16000, image: "suv",   active: true },
  { name: "Van",         type: "van",   max_pax: 11, max_luggage: 10, price_cents: 22000, image: "van",   active: true },
];

// ─── Transfer Routes ────────────────────────────────────────────────────────
const TRANSFER_ROUTES = [
  { from_location: "SJU Airport", to_location: "Cabo Rojo",   distance_km: 200, duration_minutes: 165, base_price_cents: 22000, max_pax: 4, active: true },
  { from_location: "SJU Airport", to_location: "Boquerón",    distance_km: 190, duration_minutes: 160, base_price_cents: 21000, max_pax: 4, active: true },
  { from_location: "SJU Airport", to_location: "La Parguera", distance_km: 175, duration_minutes: 150, base_price_cents: 20000, max_pax: 4, active: true },
  { from_location: "BQN Airport", to_location: "Cabo Rojo",   distance_km:  65, duration_minutes:  75, base_price_cents:  9500, max_pax: 4, active: true },
  { from_location: "Ponce",       to_location: "Cabo Rojo",   distance_km:  90, duration_minutes:  80, base_price_cents: 11000, max_pax: 4, active: true },
];

// ─── Posts ──────────────────────────────────────────────────────────────────
const POSTS = [
  { slug: "best-month-visit-cabo-rojo",
    title_es: "Por qué marzo es el mejor mes para visitar Cabo Rojo",
    title_en: "Why March Is the Best Month to Visit Cabo Rojo",
    excerpt_es: "Clima perfecto, menos multitudes y temporada de avistamiento de ballenas.",
    excerpt_en: "Perfect weather, smaller crowds, and whale-watching season.",
    category: "Season", status: "draft", featured: false, image: "palm",
    body_es: "Marzo combina las mejores condiciones del año en la costa oeste de Puerto Rico…",
    body_en: "March combines the best conditions of the year on Puerto Rico's west coast…",
    tags: ["season","cabo-rojo","weather"] },
  { slug: "san-german-old-town",
    title_es: "San Germán: el casco viejo más subestimado de Puerto Rico",
    title_en: "San Germán: Puerto Rico's Most Underrated Old Town",
    excerpt_es: "Fundada en 1573, San Germán es la segunda ciudad más antigua de las Américas.",
    excerpt_en: "Founded in 1573, San Germán is the second-oldest city in the Americas.",
    category: "Culture", status: "scheduled", featured: false, image: "van-road",
    scheduled_at: "2026-06-01T12:00:00Z",
    body_es: "A solo 30 minutos de Cabo Rojo está San Germán, una joya colonial…",
    body_en: "Just 30 minutes from Cabo Rojo sits San Germán, a colonial gem…",
    tags: ["culture","san-german","history"] },
  { slug: "playa-buye-snorkel-guide",
    title_es: "Guía de snorkel en Playa Buyé",
    title_en: "Snorkeling Guide to Playa Buyé",
    excerpt_es: "Todo lo que necesitas saber para snorkelear en una de las mejores playas del Caribe.",
    excerpt_en: "Everything you need to know to snorkel one of the Caribbean's best beaches.",
    category: "Guides", status: "published", featured: true, image: "aerial-bay",
    published_at: new Date().toISOString(),
    body_es: "Playa Buyé es famosa por su agua cristalina y arena blanca…",
    body_en: "Playa Buyé is famous for its crystal-clear water and white sand…",
    tags: ["snorkel","playa-buye","guide"] },
];

// ─── Helpers de upsert ──────────────────────────────────────────────────────
async function upsertBySlug(table, rows) {
  const { error } = await sb.from(table).upsert(rows, { onConflict: "slug" });
  if (error) throw new Error(`upsert ${table}: ${error.message}`);
  console.log(`  ✓ ${table}: ${rows.length} filas`);
}

async function clearAndInsert(table, rows) {
  // Para tablas sin slug (vehicles, transfer_routes). Borra todo y re-inserta.
  // Idempotente para datos seed; no usar si hay producción.
  const { error: delErr } = await sb.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (delErr) throw new Error(`delete ${table}: ${delErr.message}`);
  const { error: insErr } = await sb.from(table).insert(rows);
  if (insErr) throw new Error(`insert ${table}: ${insErr.message}`);
  console.log(`  ✓ ${table}: ${rows.length} filas (reset)`);
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  console.log("→ Seed prdise iniciando…\n");

  console.log("• Cuentas demo");
  for (const u of DEMO_USERS) await ensureUser(u);

  console.log("\n• Catálogo");
  await upsertBySlug("stays", STAYS);
  await upsertBySlug("tours", TOURS);
  await clearAndInsert("vehicles", VEHICLES);
  await clearAndInsert("transfer_routes", TRANSFER_ROUTES);

  console.log("\n• Blog");
  await upsertBySlug("posts", POSTS);

  console.log("\n✓ Seed completo.");
}

main().catch((e) => {
  console.error("\n✗ Seed falló:", e.message);
  process.exit(1);
});
