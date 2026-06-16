/**
 * Source del logo de PRDISE. Apunta a `/public/logoInicialHouseOfTour.png`
 * (versión con fondo transparente — se adapta al navbar/footer/splash).
 *
 * Pre-2026-06-09 vivía inline como `data:image/svg+xml;base64,…` (~38KB
 * embebidos en el bundle JS). Migración a archivo público reduce el JS y
 * permite cache HTTP por separado.
 *
 * PM 2026-06-15: solicitud del cliente vía PM — sustituir el subtítulo
 * "Your Transportation Solution" por el cursivo original "House of Tours"
 * (el cambio EXPLORE → TRANSPORT ya estaba aplicado en el cintillo). El
 * archivo anterior `logo-transp.png` queda en public/ como respaldo por
 * si se necesita revertir.
 */
export const LOGO_SRC = "/logoInicialHouseOfTour.png";
