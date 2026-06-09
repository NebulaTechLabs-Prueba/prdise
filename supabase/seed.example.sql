-- ============================================================================
-- PRDISE — SEED INICIAL DEL CATÁLOGO (modelo catálogo + referral)
-- ============================================================================
--
-- Fecha base: 2026-06-05 (post-pivote 2026-06-04).
--
-- USO:
--   $ npx supabase db reset --linked      (recrea DB + corre migraciones + corre seed)
--   $ psql ... -f supabase/seed.sql       (aplicar a una DB ya migrada)
--
-- IDEMPOTENTE: usa UUIDs fijos + `ON CONFLICT DO NOTHING` para que se
-- pueda re-correr sin romper. Para refrescar valores, borrar primero la
-- fila o usar ON CONFLICT DO UPDATE manualmente.
--
-- PRECONDICIONES:
--   1) Migraciones aplicadas (ver supabase/migrations/).
--   2) Usuario admin + cliente creados via Supabase Auth (signup normal).
--      El seed NO crea auth.users — eso requiere el flow de signup.
--      Si querés crear un admin, usá el panel Supabase Dashboard →
--      Authentication o el flow /register del sitio. Después promové
--      el rol a 'admin' en la tabla profiles (UPDATE profiles SET
--      role = 'admin' WHERE email = '...').
--
-- QUE SEEDEA:
--   * 3 partners (aliados de referral): Booking.com, Airbnb, Viator.
--   * 4 stays publicados, 1 borrador, todos linkeados a un partner.
--   * 5 tours publicados con includes + imágenes.
--   * 3 transfer routes activas + 3 vehicles (sedan/suv/van).
--   * 5 posts publicados (para validar el News magazine de ServicesPage).
--
-- QUE NO SEEDEA (post-pivote: tablas dormidas):
--   * bookings, payments, coupons, coupon_redemptions, cart_items,
--     reviews, loyalty_*. Estas tablas existen para historial pero no
--     reciben writes activos en el flow catálogo+referral.
--
-- SITE_SETTINGS: ya viene seedeado por la migración 20260606120000.
-- ============================================================================

-- ─── PARTNERS (páginas aliadas) ────────────────────────────────────────────
insert into public.partners (
  id, name, slug, base_url, logo, contact_email, contact_phone,
  notes_es, notes_en, utm_source, affiliate_code, active
) values
  ('a1111111-0001-4000-8000-000000000001',
   'Booking.com', 'booking-com',
   'https://www.booking.com/searchresults.html?ss=Cabo+Rojo+Puerto+Rico',
   null, 'partners@booking.com', null,
   'Aliado principal para estadías. Comisión vía UTM.',
   'Main partner for stays. Commission tracked via UTM.',
   'prdise', null, true),
  ('a1111111-0001-4000-8000-000000000002',
   'Airbnb', 'airbnb',
   'https://www.airbnb.com/s/Cabo-Rojo--Puerto-Rico',
   null, null, null,
   'Casas y villas privadas en la costa oeste.',
   'Private homes and villas on the west coast.',
   'prdise', null, true),
  ('a1111111-0001-4000-8000-000000000003',
   'Viator', 'viator',
   'https://www.viator.com/Puerto-Rico/d20',
   null, null, null,
   'Aliado para tours guiados y experiencias.',
   'Partner for guided tours and experiences.',
   'prdise', null, true)
on conflict (id) do nothing;

-- ─── STAYS (catálogo público — referral a partners) ────────────────────────
insert into public.stays (
  id, slug, title_es, title_en, short_desc_es, short_desc_en,
  location, lat, lng,
  price_cents, max_guests, bedrooms, bathrooms,
  amenities, images, featured, active,
  partner_id, partner_url
) values
  ('b1111111-0002-4000-8000-000000000001',
   'casa-del-mar-boqueron',
   'Casa del Mar — Boquerón', 'Casa del Mar — Boquerón',
   'Villa frente al mar con vista al Caribe, piscina privada y acceso directo a la playa.',
   'Oceanfront villa with Caribbean views, private pool and direct beach access.',
   'Boquerón', 17.9909, -67.1953,
   18500, 8, 4, 3,
   '["WiFi","Piscina","A/C","Cocina equipada","Parking","Vista al mar"]'::jsonb,
   '["https://images.unsplash.com/photo-1564501049412-61c2a3083791?w=1200","https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=1200"]'::jsonb,
   true, true,
   'a1111111-0001-4000-8000-000000000002',
   'https://www.airbnb.com/s/Boqueron--Cabo-Rojo--Puerto-Rico'),
  ('b1111111-0002-4000-8000-000000000002',
   'villa-azul-cabo-rojo',
   'Villa Azul', 'Villa Azul',
   'Refugio moderno a 5 minutos de Playa Sucia, ideal para familias.',
   'Modern retreat 5 minutes from Playa Sucia, ideal for families.',
   'Cabo Rojo', 17.9358, -67.1948,
   15000, 6, 3, 2,
   '["WiFi","A/C","Cocina","Terraza","Pet-friendly"]'::jsonb,
   '["https://images.unsplash.com/photo-1582268611958-ebfd161ef9cf?w=1200"]'::jsonb,
   false, true,
   'a1111111-0001-4000-8000-000000000001',
   'https://www.booking.com/searchresults.html?ss=Cabo+Rojo'),
  ('b1111111-0002-4000-8000-000000000003',
   'condo-la-parguera',
   'Condo La Parguera', 'Condo La Parguera',
   'Apartamento moderno cerca del Malecón de La Parguera y de la Bahía Bioluminiscente.',
   'Modern apartment near La Parguera boardwalk and the Bioluminescent Bay.',
   'La Parguera', 17.9722, -67.0467,
   9800, 4, 2, 2,
   '["WiFi","A/C","Balcón","Vista al mar","Cerca de restaurantes"]'::jsonb,
   '["https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=1200"]'::jsonb,
   false, true,
   'a1111111-0001-4000-8000-000000000001',
   'https://www.booking.com/searchresults.html?ss=La+Parguera'),
  ('b1111111-0002-4000-8000-000000000004',
   'glamping-joyuda',
   'Glamping Joyuda', 'Glamping Joyuda',
   'Experiencia única de glamping en la costa de Joyuda — domos con A/C, deck privado y desayuno incluido.',
   'Unique glamping experience on the Joyuda coast — A/C domes, private deck and breakfast included.',
   'Joyuda', 18.1308, -67.1864,
   22000, 2, 1, 1,
   '["WiFi","A/C","Desayuno","Hot tub","Vista al mar"]'::jsonb,
   '["https://images.unsplash.com/photo-1604999333679-b86d54738315?w=1200"]'::jsonb,
   true, true,
   'a1111111-0001-4000-8000-000000000002',
   'https://www.airbnb.com/s/Joyuda'),
  -- Borrador (no aparece en catálogo público) — para validar que activo=false oculta.
  ('b1111111-0002-4000-8000-000000000005',
   'beachhouse-borrador',
   'Beach House (borrador)', 'Beach House (draft)',
   'Stay en preparación. No debería verse en el público.',
   'Stay in preparation. Should NOT appear publicly.',
   'Cabo Rojo', null, null,
   12000, 6, 2, 2,
   '[]'::jsonb, '[]'::jsonb,
   false, false,
   null, null)
on conflict (id) do nothing;

-- ─── TOURS (catálogo público — referral a partners) ────────────────────────
insert into public.tours (
  id, slug, title_es, title_en, short_desc_es, short_desc_en,
  location, meeting_point, lat, lng,
  duration_minutes, max_pax, price_cents, difficulty,
  includes, images, featured, active,
  partner_id, partner_url
) values
  ('c1111111-0003-4000-8000-000000000001',
   'sunset-kayak-la-parguera',
   'Kayak al Atardecer — La Parguera',
   'Sunset Kayak — La Parguera',
   'Salida en kayak por los canales de manglares con guías locales bilingües. Termina con la puesta de sol sobre los cayos.',
   'Kayak through mangrove channels with local bilingual guides. Ends with sunset over the keys.',
   'La Parguera', 'Muelle de La Parguera', 17.9722, -67.0467,
   180, 8, 6500, 'Easy',
   '["Kayak","Chaleco salvavidas","Guía bilingüe","Agua embotellada"]'::jsonb,
   '["https://images.unsplash.com/photo-1502920917128-1aa500764cbd?w=1200"]'::jsonb,
   true, true,
   'a1111111-0001-4000-8000-000000000003',
   'https://www.viator.com/Puerto-Rico/d20'),
  ('c1111111-0003-4000-8000-000000000002',
   'snorkel-playa-sucia',
   'Snorkel en Playa Sucia',
   'Snorkel at Playa Sucia',
   'Día completo de snorkel en uno de los arrecifes más vírgenes de Puerto Rico. Incluye equipo y almuerzo criollo.',
   'Full day snorkeling at one of Puerto Rico''s most pristine reefs. Equipment and creole lunch included.',
   'Cabo Rojo', 'Faro Los Morrillos parking', 17.9358, -67.1948,
   360, 10, 9500, 'Moderate',
   '["Equipo de snorkel","Almuerzo criollo","Transporte 4x4 al faro","Guía bilingüe"]'::jsonb,
   '["https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=1200"]'::jsonb,
   true, true,
   'a1111111-0001-4000-8000-000000000003',
   'https://www.viator.com/Puerto-Rico/d20'),
  ('c1111111-0003-4000-8000-000000000003',
   'bioluminescent-tour',
   'Tour Bahía Bioluminiscente',
   'Bioluminescent Bay Tour',
   'Tour nocturno en lancha eléctrica por la Bahía Bioluminiscente de La Parguera, una de las más activas del mundo.',
   'Night boat tour through La Parguera''s Bioluminescent Bay, one of the most active in the world.',
   'La Parguera', 'Muelle principal', 17.9722, -67.0467,
   120, 12, 5500, 'Easy',
   '["Tour en lancha","Guía bilingüe","Snorkeling opcional","Toallas"]'::jsonb,
   '["https://images.unsplash.com/photo-1571415060716-baff5f717f6e?w=1200"]'::jsonb,
   false, true,
   'a1111111-0001-4000-8000-000000000003',
   'https://www.viator.com/Puerto-Rico/d20'),
  ('c1111111-0003-4000-8000-000000000004',
   'food-tour-joyuda',
   'Food Tour — La Milla de Oro Joyuda',
   'Food Tour — Joyuda Gold Mile',
   'Recorrido culinario por la legendaria ruta de mariscos de Joyuda, con paradas en 4 restaurantes locales.',
   'Culinary tour along Joyuda''s legendary seafood mile, stopping at 4 local restaurants.',
   'Joyuda', 'Restaurante El Bohío', 18.1308, -67.1864,
   240, 8, 8500, 'Easy',
   '["4 paradas con degustación","Bebida en cada parada","Transporte","Guía bilingüe"]'::jsonb,
   '["https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1200"]'::jsonb,
   false, true,
   null, null),
  ('c1111111-0003-4000-8000-000000000005',
   'hidden-beaches-4x4',
   'Playas Escondidas en 4x4',
   'Hidden Beaches 4x4 Tour',
   'Aventura en 4x4 por playas que solo los locales conocen — Playuela, Sucia, El Faro y más.',
   '4x4 adventure to beaches only locals know — Playuela, Sucia, El Faro and more.',
   'Cabo Rojo', 'Faro Los Morrillos parking', 17.9358, -67.1948,
   300, 6, 11000, 'Moderate',
   '["Transporte 4x4","Guía bilingüe","Agua y snacks","4 paradas de playa"]'::jsonb,
   '["https://images.unsplash.com/photo-1530541930197-ff16ac917b0e?w=1200"]'::jsonb,
   true, true,
   'a1111111-0001-4000-8000-000000000003',
   'https://www.viator.com/Puerto-Rico/d20')
on conflict (id) do nothing;

-- ─── TRANSFER ROUTES (servicio nativo) ─────────────────────────────────────
insert into public.transfer_routes (
  id, from_location, to_location, distance_km, duration_minutes,
  base_price_cents, max_pax, active
) values
  ('d1111111-0004-4000-8000-000000000001',
   'SJU Airport', 'Cabo Rojo', 195.0, 180, 15000, 6, true),
  ('d1111111-0004-4000-8000-000000000002',
   'BQN Airport', 'Cabo Rojo', 45.0, 60, 6500, 6, true),
  ('d1111111-0004-4000-8000-000000000003',
   'SJU Airport', 'La Parguera', 210.0, 195, 16500, 6, true)
on conflict (id) do nothing;

-- ─── VEHICLES (catálogo de la flota) ───────────────────────────────────────
insert into public.vehicles (
  id, name, type, max_pax, max_luggage, price_cents, active
) values
  ('e1111111-0005-4000-8000-000000000001',
   'Sedan Ejecutivo', 'sedan', 3, 3, 8000, true),
  ('e1111111-0005-4000-8000-000000000002',
   'SUV Familiar', 'suv', 6, 6, 12000, true),
  ('e1111111-0005-4000-8000-000000000003',
   'Van Grupos', 'van', 12, 10, 18000, true)
on conflict (id) do nothing;

-- ─── POSTS (blog) ──────────────────────────────────────────────────────────
-- Importantes para validar el News magazine en ServicesPage (Fase 1 fix):
-- featured = posts[0], small = [1..3], sidebar = [0..6]. Con 5 posts el
-- layout se llena entero.
insert into public.posts (
  id, slug, title_es, title_en, excerpt_es, excerpt_en,
  body_es, body_en, category, featured, status, published_at, image
) values
  ('f1111111-0006-4000-8000-000000000001',
   'verano-2026-tours-nuevos',
   'Verano 2026: Tours nuevos en Cabo Rojo',
   'Summer 2026: New tours in Cabo Rojo',
   'Lanzamos 3 nuevas experiencias para esta temporada: kayak nocturno, snorkel en arrecifes vírgenes y un food tour por Joyuda.',
   'We''re launching 3 new experiences this season: night kayaking, snorkeling at pristine reefs, and a food tour through Joyuda.',
   'Contenido completo del post — Verano 2026 en PRDISE. Editar desde el panel admin.',
   'Full post content — Summer 2026 at PRDISE. Edit from admin panel.',
   'Temporada', true, 'published', '2026-05-15T10:00:00Z',
   'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200'),
  ('f1111111-0006-4000-8000-000000000002',
   'playas-escondidas-locales',
   'Playas que solo los locales conocen',
   'Beaches only locals know',
   '5 playas en Cabo Rojo que no aparecen en las guías turísticas — y cómo llegar a cada una.',
   '5 beaches in Cabo Rojo not in the tourist guides — and how to reach each one.',
   'Contenido completo — playas secretas.',
   'Full content — secret beaches.',
   'Tips', false, 'published', '2026-05-10T09:00:00Z',
   'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200'),
  ('f1111111-0006-4000-8000-000000000003',
   'guia-bahia-bio',
   'Guía para visitar la Bahía Bioluminiscente',
   'Guide to visiting the Bioluminescent Bay',
   'La mejor época del mes, qué llevar y cómo escoger un tour responsable.',
   'Best time of month, what to bring, and how to pick a responsible tour.',
   'Contenido completo — bahía bio.',
   'Full content — bio bay.',
   'Guía', false, 'published', '2026-05-05T09:00:00Z',
   'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1200'),
  ('f1111111-0006-4000-8000-000000000004',
   'food-mile-joyuda',
   'La Milla de Oro de Joyuda — mapa para amantes del mariscos',
   'Joyuda''s Gold Mile — a seafood lover''s map',
   'Restaurantes que vale la pena visitar en la legendaria ruta de mariscos.',
   'Restaurants worth visiting on the legendary seafood mile.',
   'Contenido completo — food tour.',
   'Full content — food tour.',
   'Comida', false, 'published', '2026-04-28T09:00:00Z',
   'https://images.unsplash.com/photo-1559339352-11d035aa65de?w=1200'),
  ('f1111111-0006-4000-8000-000000000005',
   'conducir-en-puerto-rico',
   'Conducir en Puerto Rico: lo que turistas deben saber',
   'Driving in Puerto Rico: what tourists should know',
   'Reglas locales, señalización, alquiler de auto vs traslados — y cuándo conviene cada opción.',
   'Local rules, signage, car rental vs transfers — and when each option makes sense.',
   'Contenido completo — driving.',
   'Full content — driving.',
   'Tips', false, 'published', '2026-04-20T09:00:00Z',
   'https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=1200')
on conflict (id) do nothing;

-- ============================================================================
-- FIN DEL SEED.
--
-- POST-SEED (manual, no incluido):
--   * Promover el usuario admin: UPDATE profiles SET role = 'admin'
--     WHERE email = 'tu-admin@email.com';
--   * Crear cliente de prueba via /register en el sitio.
--   * Verificar en el sitio público que: home muestra los 5 tours en
--     curated experiences, /stays muestra 4 stays (no el borrador),
--     /tours muestra 5 tours, /services muestra News magazine con
--     featured + 2 small + sidebar de 5, ServicesPage News usa los posts
--     reales.
-- ============================================================================
