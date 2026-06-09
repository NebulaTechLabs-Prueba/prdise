/**
 * Source del logo de PRDISE. Apunta a `/public/logo-transp.png` (versión
 * con fondo transparente — se adapta al fondo del navbar/footer/splash).
 *
 * Si en el futuro hay un SVG vector limpio, mover a `/public/logo.svg` y
 * actualizar la constante.
 *
 * Pre-2026-06-09 vivía inline como `data:image/svg+xml;base64,…` (~38KB
 * embebidos en el bundle JS). Migración a archivo público reduce el JS y
 * permite cache HTTP por separado.
 */
export const LOGO_SRC = "/logo-transp.png";
