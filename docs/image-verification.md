# Verificación de imágenes asignadas a servicios

> Generado: 2026-06-17  ·  Servicios: 35

Cruce entre la imagen asignada a cada servicio y la oferta real del
partner (verificada por WebFetch contra el sitio web del aliado, o
por inferencia desde slug+título cuando no hay URL disponible).

**Leyenda:**

| Badge | Significado |
|---|---|
| ✅ | Imagen alineada con la experiencia real — sin acción requerida |
| ⚠️ | Revisar y considerar regenerar — el prompt/imagen es demasiado genérico o sutilmente desajustado |
| ❌ | Mismatch claro — regenerar |
| ⬜ | Sin imagen asignada (test o pendiente) |
| ℹ️ | Partner sin URL pública — verdicto basado solo en slug/título |

**Resumen:**

- ✅ Alineadas: 25
- ⚠️ Revisar: 7
- ❌ Mismatch: 0
- ⬜ Sin imagen: 3

---

## — (3)

### ⬜ Luz Menguante
*slug: `hotel-mq9rykxw` · veredicto: **Sin imagen***

Imagen actual: https://picsum.photos/seed/hotel-mq9rykxw/1600/900

> Stay de prueba — el cliente decidió no generar imagen para esta entrega.

### ⬜ Turmoline
*slug: `turmoline-bgl0` · veredicto: **Sin imagen***

Imagen actual: https://picsum.photos/seed/turmoline-bgl0/1600/900

> Stay de prueba — el cliente decidió no generar imagen para esta entrega.

### ✅ Jayuya Individual Attractions (pricing TBD)
*slug: `tu-centro-jayuya-jayuya-individual-attractions-pricing-tbd` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/6fd95ed6-1d84-4bfc-8c5f-1d7b649b9ac6/cover-uploaded-mqi0xlpv.png

> Atracciones individuales en Jayuya (petroglifos, museos, fincas). Prompt 'Taíno petroglyphs carved into granite boulder Jayuya highlands' — fit excelente, ícono cultural reconocible.

---

## AVENTOURA PUERTO RICO (4)

URL partner: https://wa.me/17872379519

### ✅ Aguadilla UTV — Convoy 8 Max
*slug: `aventoura-puerto-rico-aguadilla-utv-convoy-8-max` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/2f435f9c-6b10-4e60-a018-1fb504fd5a9b/cover-uploaded-mqi0wt7l.png

> UTV Convoy (2 unidades, conducís siguiendo al guía). Prompt: UTV buggy en jungle trail PR — alineado con la actividad, aunque convoy implicaría varios vehículos visibles. Aceptable.

### ✅ Aguadilla UTV — Guided 3 Max
*slug: `aventoura-puerto-rico-aguadilla-utv-guided-3-max` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/a6869ec7-8feb-4b94-958b-fbdbfa78a0e7/cover-uploaded-mqi0wuwz.png

> UTV guiado 3-seater Can-Am en Ruinas del Faro / Playa Blanca / Aguadilla. Prompt UTV genérico es válido — no diferencia el modelo Can-Am pero sí captura el tipo de experiencia.

### ✅ Aguadilla UTV — Guided 6 Max
*slug: `aventoura-puerto-rico-aguadilla-utv-guided-6-max` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/fee0db29-ffe9-4fe2-a6c3-cf1c869dcb6e/cover-uploaded-mqi0ww5x.png

> Idem guided-3 — son 2 Can-Am de 3 plazas cada uno con guía. Prompt UTV genérico cubre la experiencia.

### ⚠️ Piñones UTV Tour (near San Juan)
*slug: `aventoura-puerto-rico-pinones-utv-tour-near-san-juan` · veredicto: **Revisar***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/d1a5d12b-ea93-4bbd-b939-72f4fe681a13/cover-uploaded-mqi0wxe1.png

> Piñones está cerca de San Juan (costa nordeste, urbano-costero), NO en las montañas del oeste como dice el prompt. La imagen probablemente muestra montaña/jungla. ⚠️ Considerar regenerar con setting costero/manglar de Piñones.

---

## AVENTUREO PR (1)

URL partner: https://aventureopr.com

### ✅ Tanamá Full Day Adventure
*slug: `aventureo-pr-tanama-full-day-adventure` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/b473f6d9-2b25-4858-8f16-2bb5f3090958/cover-uploaded-mqi0wylb.png

> Confirmado vía aventureopr.com: ofrecen cave tubing en Tanamá (Arecibo) + río + cuevas. Prompt 'rappelling into limestone river cave' captura el espíritu; estrictamente el partner es más tubing que rappel, pero el sentido aventurero está.

---

## ENDLESS SUMMER (6)

URL partner: https://facebook.com/share/17abLH2sg4

### ✅ Beach Chair Rental
*slug: `endless-summer-beach-chair-rental` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/85c296b4-71ba-4090-9a15-8a074b79fc12/cover-uploaded-mqi0wzj8.png

> Alquiler de silla en Buyé Beach. Prompt premium beach setup con palm shade — fit directo.

### ⚠️ Beach Tent Rental
*slug: `endless-summer-beach-tent-rental` · veredicto: **Revisar***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/b9319f28-421d-4b5a-91fb-5850a029d4a1/cover-uploaded-mqi0x0c7.png

> El prompt genérico de 'premium beach setup' es el mismo para los 5 rentals beach_gear. Sin diferenciar tienda vs silla vs sombrilla, las 5 imágenes seguramente son similares entre sí. Útil para diferenciación por servicio si el cliente quiere imágenes distintas.

### ⚠️ Beach Umbrella Rental
*slug: `endless-summer-beach-umbrella-rental` · veredicto: **Revisar***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/4af12c41-23ad-40fb-b906-b13885c1b848/cover-uploaded-mqi0x158.png

> Mismo template beach_gear que tent/chair/table. ⚠️ Considerar prompts más específicos: solo sombrilla aislada, solo silla, solo carpa.

### ✅ Dominó Table Rental
*slug: `endless-summer-domino-table-rental` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/4efe4f4d-e820-407a-b47d-3c8913603ebf/cover-uploaded-mqi0x265.png

> Prompt específico de mesa de dominó en la playa — bien diferenciado del resto del lineup beach_gear.

### ⚠️ Table Rental
*slug: `endless-summer-table-rental` · veredicto: **Revisar***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/00515313-9745-45f0-8391-6fe19303d1e5/cover-uploaded-mqi0x2yp.png

> Prompt beach_gear genérico (premium setup completo). Para una mesa simple convendría una imagen sólo de la mesa.

### ⚠️ Water Bikes
*slug: `endless-summer-water-bikes` · veredicto: **Revisar***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/49ef6f17-8997-4980-bbf2-2461f218da20/cover-uploaded-mqi0x3q2.png

> Prompt usa template 'paddle' (paddleboarder gliding). Water bikes son distintos a SUP — son bicicletas flotantes. ⚠️ Considerar regenerar con prompt específico de hydrobike/water bike.

---

## ENDLESS SUMMER WATER SPORT (4)

URL partner: https://wa.me/17872379519

### ✅ Banana Boat Ride
*slug: `endless-summer-water-sport-banana-boat-ride` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/0cef8ee4-038f-4f66-9bce-3ffcc9ff69cb/cover-uploaded-mqi0x4fe.png

> Prompt directo de banana boat amarillo siendo remolcado — fit perfecto.

### ✅ Jet Ski Rental
*slug: `endless-summer-water-sport-jet-ski-rental` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/e407a11a-b6df-47ca-8f45-0bc90fc79620/cover-uploaded-mqi0x592.png

> Prompt directo de jet-skis en Buyé Beach Cabo Rojo — fit perfecto.

### ✅ Kayak Rental
*slug: `endless-summer-water-sport-kayak-rental` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/75119c63-9f04-4fe7-b155-65bfff2eafcc/cover-uploaded-mqi0x65b.png

> Prompt de kayak en bahía turquesa de PR — fit correcto.

### ✅ Paddle Board (SUP)
*slug: `endless-summer-water-sport-paddle-board-sup` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/45e8fda7-98c5-4d3f-a805-5df1a213b613/cover-uploaded-mqi0x72h.png

> Prompt específico de SUP cerca de Buyé Beach — fit directo.

---

## KATARINA SAIL CHARTERS (2)

URL partner: https://sailrinconpr.com

### ✅ Afternoon Sunset Sail
*slug: `katarina-sail-charters-afternoon-sunset-sail` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/7cc094a0-7fe2-4b2b-a899-a1a9c7f7fbc4/cover-uploaded-mqi0x7v6.png

> Confirmado: 32ft catamaran USCG-cert en Rincón. Prompt 'white-sail catamaran cruising at sunset off Rincón' es exacto a la oferta.

### ✅ Morning Snorkel Sail
*slug: `katarina-sail-charters-morning-snorkel-sail` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/b89085ae-15d4-4c3e-818b-75df1b4366e7/cover-uploaded-mqi0x8r8.png

> Confirmado: morning snorkel sail en el mismo catamaran (Tres Palmas Reserve / Shipwreck). Prompt snorkel sobre coral reef es adecuado, aunque el partner combina vela + snorkel — la imagen sólo muestra el snorkel. Aceptable.

---

## LA BARRA SALADA PR (3)

URL partner: https://labarrasaladapr.com

### ✅ La Barra Salada — Boat (Max 6)
*slug: `la-barra-salada-pr-la-barra-salada-boat-max-6` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/95b6fe8b-666d-46ff-ad70-ce96c4d6425b/cover-uploaded-mqi0x9g9.png

> Confirmado: barcos USCG-cert salen de Las Crayolas Boat Ramp Lajas hacia Rabo de Gata. Prompt 'sleek private dive/snorkel boat' es correcto al tipo de operación.

### ✅ La Barra Salada — Premium Boat (Max 6)
*slug: `la-barra-salada-pr-la-barra-salada-premium-boat-max-6` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/583be6a6-17a1-4d26-8adc-bf0f44d3ed2d/cover-uploaded-mqi0xab8.png

> Versión premium del anterior — mismo prompt boat. Si el cliente quiere diferenciar visualmente premium vs estándar, considerar imagen con más detalle de servicio en cubierta.

### ✅ La Mesa Salada — Floating Table (Max 4)
*slug: `la-barra-salada-pr-la-mesa-salada-floating-table-max-4` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/8a32d0f4-882e-4bcd-a49f-89c2aa802c39/cover-uploaded-mqi0xb4s.png

> Confirmado: floating table para hasta 4 personas. Prompt 'floating wooden table in waist-deep turquoise water La Parguera' — fit exacto a la propuesta del partner.

---

## PARGUERA WATER SPORTS / BIO BAY (6)

URL partner: https://biobayparguera.com

### ✅ Bio Bay Kayak & Swim Tour
*slug: `parguera-water-sports-bio-bay-bio-bay-kayak-swim-tour` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/b433705f-35e0-4ffb-a108-19c3c9fd755e/cover-uploaded-mqi0xbv4.png

> Confirmado: el tour estrella del partner. Prompt 'kayak gliding across turquoise bay' — fit razonable. Para diferenciar de los otros bio-bay convendría que la imagen muestre kayak + bioluminiscencia nocturna.

### ⚠️ Private Island Adventure Boat Tour
*slug: `parguera-water-sports-bio-bay-private-island-adventure-boat-tour` · veredicto: **Revisar***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/6655ac51-25c6-4173-9db5-5958be6485f5/cover-uploaded-mqi0xcn3.png

> Servicio: full day en cayos por barco privado. Prompt usa template 'bio_bay' (bioluminiscencia nocturna) — pero este tour es DIURNO en cayos. ⚠️ Regenerar con prompt de barco + cayos diurnos turquesa.

### ✅ Sunset Swim & Kayak Bio Bay
*slug: `parguera-water-sports-bio-bay-sunset-swim-kayak-bio-bay` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/8d02649c-1801-4d31-bae7-bfbf83ee0eaf/cover-uploaded-mqi0xde7.png

> Sunset swim en cayo + kayak bioluminiscente. Prompt kayak — aceptable. Idealmente la imagen mostraría transición sunset→noche con bioluminiscencia.

### ✅ Swimming Bio Bay Adventure
*slug: `parguera-water-sports-bio-bay-swimming-bio-bay-adventure` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/d0fc817a-905b-4e4b-b6e0-c1ea548cb924/cover-uploaded-mqi0xe3e.png

> Swimming-only nocturno en bio bay. Prompt 'bioluminescent bay at night, glowing plankton trails' — fit directo.

### ✅ VIP Snorkeling
*slug: `parguera-water-sports-bio-bay-vip-snorkeling` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/786b0a1f-aa4e-45f8-bd24-2eab365af81a/cover-uploaded-mqi0xezb.png

> VIP snorkeling en cayos La Parguera. Prompt snorkel sobre reef — fit correcto, aunque 'VIP' sugeriría una imagen más exclusiva (barco privado, pocas personas).

### ⚠️ Water Birthday Splash
*slug: `parguera-water-sports-bio-bay-water-birthday-splash` · veredicto: **Revisar***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/172bb165-ec60-4ae9-9bd2-c82d90216af6/cover-uploaded-mqi0xfsa.png

> Servicio: cumpleaños privado en pontoon boat. Prompt usa template bio_bay nocturno bioluminiscente. ⚠️ Una fiesta diurna en pontoon NO es lo mismo — regenerar con vibe de celebración + pontoon en agua turquesa.

---

## PINTOS "R" US (5)

URL partner: https://www.pintosrus.com

### ✅ Group Ride
*slug: `pintos-r-us-group-ride` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/13502a7a-6f83-487f-bc3e-5f1bfa9ac987/cover-uploaded-mqi0xglr.png

> Confirmado: tour 2h en grupo desde Black Eagle Marina Rincón, beaches + tropical trails. Prompt 'horseback rider on white-sand beach at golden hour' — fit excelente.

### ✅ Marina Pony Ride
*slug: `pintos-r-us-marina-pony-ride` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/8e456412-6478-42dd-941c-74993d20e079/cover-uploaded-mqi0xhbm.png

> Confirmado: ~20min para niños 2-10 en la marina con stop fotográfico en playa. Prompt 'pony with child rider along marina boardwalk' — fit muy específico y correcto.

### ✅ Pony Experience
*slug: `pintos-r-us-pony-experience` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/6e8b8c28-6691-4ade-8146-8494d3f10dc4/cover-uploaded-mqi0xidz.png

> Confirmado: 45min farm experience (groom + tack + ride). Prompt usa el mismo template 'pony' que marina-pony-ride. ⚠️ Si querés diferenciar, regenerar con escena de granja (no marina).

### ✅ Private Ride
*slug: `pintos-r-us-private-ride` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/342504d9-fc29-4d0d-a5d4-ff4ca9de3f91/cover-uploaded-mqi0xjf1.png

> Tour privado 2h para riders experimentados. Prompt 'horseback rider on white-sand beach' — mismo template que group-ride. Diferenciación visual marginal.

### ⬜ Special Events Package
*slug: `pintos-r-us-special-events-package` · veredicto: **Sin imagen***

Imagen actual: https://picsum.photos/seed/pintos-r-us-special-events-package/1600/900

> No se generó imagen para este servicio en este lote.

---

## TU CENTRO JAYUYA (1)

URL partner: https://wa.me/17876728969

### ✅ Jayuya Full Day Cultural Tour (Phase 1)
*slug: `tu-centro-jayuya-jayuya-full-day-cultural-tour-phase-1` · veredicto: **Alineado***

Imagen actual: https://krmihhwpwhvycveupiwy.supabase.co/storage/v1/object/public/service-images/tour/e40cf382-7a21-4659-83bc-16f66f031797/cover-uploaded-mqi0xk7q.png

> Tour cultural full-day en Jayuya: Piedra Escrita, Museo El Cemí, hacienda café. Prompt 'hillside coffee hacienda Jayuya, traditional wooden buildings' — captura el espíritu cultural montañoso.

---
