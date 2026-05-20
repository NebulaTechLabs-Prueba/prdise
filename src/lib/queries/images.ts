/**
 * Mapeo de slugs cortos de imagen a identificadores estables.
 *
 * Las constantes `IMG_*` reales (URLs CDN, base64, etc.) viven dentro de
 * `src/components/PrdiseApp.jsx` — ese archivo está bajo control exclusivo
 * del chat principal y no puede ser editado por subagentes. Por ahora este
 * módulo expone los slugs en formato canónico para que las queries y los
 * componentes de catálogo puedan referenciarlos por nombre estable.
 *
 * Convención:
 *   - DB guarda en `stays.images` / `tours.images` arrays de slugs cortos
 *     (`["aerial-bay", "palm"]`).
 *   - `resolveImages(slugs)` los traduce a las constantes reales.
 *   - En esta fase `resolveImages` es passthrough (devuelve los slugs sin
 *     transformar). El chat principal sobreescribirá / re-exportará esta
 *     función con el binding real a `IMG_AERIAL_BAY`, `IMG_PALM`, etc.,
 *     cuando conecte el JSX al catálogo.
 */

/**
 * Mapa slug → identificador canónico de la constante en PrdiseApp.jsx.
 *
 * Cada entrada apunta al MISMO identificador; el valor es solo un placeholder
 * que indica qué constante terminal va a resolver el chat principal.
 */
export const imageSlugMap: Record<string, string> = {
  "aerial-bay": "IMG_AERIAL_BAY",
  palm: "IMG_PALM",
  "sunset-jetski": "IMG_SUNSET_JETSKI",
  lighthouse: "IMG_LIGHTHOUSE",
  zipline: "IMG_ZIPLINE",
  mangroves: "IMG_MANGROVES",
  "van-road": "IMG_VAN_ROAD",
  sedan: "IMG_SEDAN",
  suv: "IMG_SUV",
  van: "IMG_VAN",
};

/**
 * Resuelve una lista de slugs cortos a strings finales para `<img src>`.
 *
 * NOTA: implementación placeholder — retorna los slugs tal cual. El chat
 * principal va a sobrescribir / re-exportar esta función con el binding real
 * a las constantes `IMG_*` de `src/components/PrdiseApp.jsx`. Mientras tanto,
 * los consumidores que pasen slugs reciben slugs; útil para tests y para
 * pintar fallbacks en desarrollo.
 *
 * @param slugs lista de slugs cortos (ej. `["aerial-bay", "palm"]`).
 * @returns array del mismo largo con los valores resueltos (passthrough por ahora).
 */
export function resolveImages(slugs: string[]): string[] {
  if (!Array.isArray(slugs)) return [];
  return slugs.map((s) => (typeof s === "string" ? s : ""));
}
