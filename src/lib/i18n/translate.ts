/**
 * Helpers de i18n para filas bilingües con columnas `_es` / `_en`.
 *
 * Convención: la fila viene de Supabase con sufijos (`title_es`, `title_en`,
 * `description_es`, ...). Estos helpers exponen un objeto plano sin sufijos,
 * con fallback al otro idioma si el campo está vacío.
 */
import type { Tables } from "@/lib/supabase/database.types";

export type Lang = "es" | "en";

/**
 * Devuelve el valor de `row[<field>_<lang>]` con fallback al otro idioma si
 * está vacío o `null`. Si ninguno tiene contenido devuelve `""`.
 *
 * Ej: `pickLang(stay, "title", "es")` → `stay.title_es || stay.title_en || ""`.
 */
export function pickLang<T extends Record<string, unknown>>(
  row: T,
  field: string,
  lang: Lang
): string {
  const other: Lang = lang === "es" ? "en" : "es";
  const primary = row[`${field}_${lang}` as keyof T];
  const fallback = row[`${field}_${other}` as keyof T];

  if (typeof primary === "string" && primary.trim().length > 0) return primary;
  if (typeof fallback === "string" && fallback.trim().length > 0) return fallback;
  return "";
}

/* ============================================================================
 * Stays
 * ============================================================================ */

export type LocalizedStay = Omit<
  Tables<"stays">,
  "title_es" | "title_en" | "short_desc_es" | "short_desc_en" | "description_es" | "description_en"
> & {
  title: string;
  short_desc: string;
  description: string;
};

export function localizeStay(row: Tables<"stays">, lang: Lang): LocalizedStay {
  const {
    title_es: _ts,
    title_en: _te,
    short_desc_es: _ses,
    short_desc_en: _sen,
    description_es: _des,
    description_en: _den,
    ...rest
  } = row;
  // Suprimir warnings de unused vars; los campos se descartan a propósito.
  void _ts;
  void _te;
  void _ses;
  void _sen;
  void _des;
  void _den;

  return {
    ...rest,
    title: pickLang(row, "title", lang),
    short_desc: pickLang(row, "short_desc", lang),
    description: pickLang(row, "description", lang),
  };
}

/* ============================================================================
 * Tours
 * ============================================================================ */

export type LocalizedTour = Omit<
  Tables<"tours">,
  "title_es" | "title_en" | "short_desc_es" | "short_desc_en" | "description_es" | "description_en"
> & {
  title: string;
  short_desc: string;
  description: string;
};

export function localizeTour(row: Tables<"tours">, lang: Lang): LocalizedTour {
  const {
    title_es: _ts,
    title_en: _te,
    short_desc_es: _ses,
    short_desc_en: _sen,
    description_es: _des,
    description_en: _den,
    ...rest
  } = row;
  void _ts;
  void _te;
  void _ses;
  void _sen;
  void _des;
  void _den;

  return {
    ...rest,
    title: pickLang(row, "title", lang),
    short_desc: pickLang(row, "short_desc", lang),
    description: pickLang(row, "description", lang),
  };
}

/* ============================================================================
 * Posts
 * ============================================================================ */

export type LocalizedPost = Omit<
  Tables<"posts">,
  "title_es" | "title_en" | "excerpt_es" | "excerpt_en" | "body_es" | "body_en"
> & {
  title: string;
  excerpt: string;
  body: string;
};

export function localizePost(row: Tables<"posts">, lang: Lang): LocalizedPost {
  const {
    title_es: _ts,
    title_en: _te,
    excerpt_es: _xs,
    excerpt_en: _xe,
    body_es: _bs,
    body_en: _be,
    ...rest
  } = row;
  void _ts;
  void _te;
  void _xs;
  void _xe;
  void _bs;
  void _be;

  return {
    ...rest,
    title: pickLang(row, "title", lang),
    excerpt: pickLang(row, "excerpt", lang),
    body: pickLang(row, "body", lang),
  };
}
