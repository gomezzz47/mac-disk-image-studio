import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { es, type Dict } from "./es";
import { en, it, ca, fr, de, ru } from "./others";

export const LANGS = [
  { code: "es", label: "Español" }, { code: "it", label: "Italiano" }, { code: "ca", label: "Català" },
  { code: "en", label: "English (US)" }, { code: "ru", label: "Русский" }, { code: "fr", label: "Français" }, { code: "de", label: "Deutsch" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];
export const DICTS: Record<Lang, Dict> = { es, it, ca, en, ru, fr, de };
const KEY = "cofre-idioma";

export type TFn = (k: keyof Dict, vars?: Record<string, string | number>) => string;
export const makeT = (lang: Lang): TFn => (k, vars) => {
  let s: string = DICTS[lang][k] ?? es[k];
  if (vars) for (const [a, b] of Object.entries(vars)) s = s.replaceAll(`{${a}}`, String(b));
  return s;
};

const Ctx = createContext<{ lang: Lang; setLang: (l: Lang) => void; t: TFn }>({ lang: "es", setLang: () => {}, t: makeT("es") });
export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>("es");
  useEffect(() => { const s = localStorage.getItem(KEY) as Lang | null; if (s && s in DICTS) setLangState(s); }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  const setLang = (l: Lang) => { localStorage.setItem(KEY, l); setLangState(l); };
  return <Ctx.Provider value={{ lang, setLang, t: makeT(lang) }}>{children}</Ctx.Provider>;
}
export const useI18n = () => useContext(Ctx);
