"use client";

/**
 * Provider de idioma para Client Components.
 *
 * - Default: `es`.
 * - Persistencia: localStorage clave `prdise.lang`.
 * - Si el usuario está autenticado, el `setLang` debería sincronizar
 *   `profiles.lang_pref` vía Server Action. Se deja un TODO; la integración
 *   real con `updateProfile` la conecta el chat principal.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Lang } from "./translate";

const STORAGE_KEY = "prdise.lang";
const DEFAULT_LANG: Lang = "es";

interface LangContextValue {
  lang: Lang;
  setLang: (next: Lang) => void;
}

const LangContext = createContext<LangContextValue | null>(null);

function isLang(value: unknown): value is Lang {
  return value === "es" || value === "en";
}

function readInitialLang(): Lang {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    // localStorage puede fallar (modo privado, SSR, etc.).
  }
  return DEFAULT_LANG;
}

export interface LangProviderProps {
  children: ReactNode;
  /** Idioma inicial (ej. `profiles.lang_pref` resuelto en server). */
  initialLang?: Lang;
}

export function LangProvider({ children, initialLang }: LangProviderProps) {
  const [lang, setLangState] = useState<Lang>(initialLang ?? DEFAULT_LANG);

  // Hidratar desde localStorage en el primer mount (cliente).
  useEffect(() => {
    if (initialLang) return;
    const fromStorage = readInitialLang();
    if (fromStorage !== lang) setLangState(fromStorage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignorar fallos de persistencia.
    }
    // TODO(chat principal): si hay sesión activa, llamar a la Server Action
    // `updateProfile({ lang_pref: next })` para persistir en `profiles`.
    // Importar desde `@/lib/actions/profile` cuando exista; este provider
    // queda agnóstico al backend para evitar acoplar el client bundle a
    // Server Actions específicas.
  }, []);

  const value = useMemo<LangContextValue>(() => ({ lang, setLang }), [lang, setLang]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) {
    throw new Error("useLang debe usarse dentro de <LangProvider>.");
  }
  return ctx;
}
