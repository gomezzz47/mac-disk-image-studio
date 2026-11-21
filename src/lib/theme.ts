// Light / dark / custom (RGB) appearance, saved on this device.
export type RGB = [number, number, number];
export type ThemeMode = "light" | "dark" | "custom";
export type CustomColors = { bg: RGB; surface: RGB; accent: RGB; text: RGB };
export type ThemeSettings = { mode: ThemeMode; custom: CustomColors };
const KEY = "cofre-tema";
export const DEFAULT_CUSTOM: CustomColors = { bg: [12, 20, 38], surface: [24, 36, 62], accent: [64, 140, 255], text: [236, 241, 250] };
const VARS = ["--folder-front", "--folder-back", "--background", "--foreground", "--card", "--card-foreground", "--popover", "--popover-foreground", "--primary", "--primary-foreground", "--secondary", "--secondary-foreground", "--muted", "--muted-foreground", "--accent", "--accent-foreground", "--border", "--input", "--ring"];

const css = ([r, g, b]: RGB) => `rgb(${r} ${g} ${b})`;
const lum = ([r, g, b]: RGB) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
export const clamp255 = (n: number) => Math.max(0, Math.min(255, Math.round(Number.isFinite(n) ? n : 0)));

/** CSS variables for a custom palette (also used by the live preview). */
export function customVars(c: CustomColors): Record<string, string> {
  const mix = (a: RGB, p: number) => `color-mix(in srgb, ${css(a)} ${p}%, ${css(c.surface)})`;
  const onAccent = lum(c.accent) > 0.6 ? "rgb(15 15 20)" : "rgb(255 255 255)";
  return {
    "--background": css(c.bg), "--foreground": css(c.text), "--card": css(c.surface), "--card-foreground": css(c.text),
    "--popover": css(c.surface), "--popover-foreground": css(c.text), "--primary": css(c.accent), "--primary-foreground": onAccent,
    "--secondary": mix(c.text, 10), "--secondary-foreground": css(c.text), "--muted": mix(c.text, 10), "--muted-foreground": mix(c.text, 65),
    "--accent": mix(c.text, 12), "--accent-foreground": css(c.text), "--border": mix(c.text, 16), "--input": mix(c.text, 22), "--ring": css(c.accent),
    "--folder-front": `color-mix(in srgb, ${css(c.accent)} 80%, white)`, "--folder-back": css(c.accent),
  };
}

export function loadTheme(): ThemeSettings {
  try { const s = JSON.parse(localStorage.getItem(KEY) ?? ""); if (s?.mode) return { mode: s.mode, custom: { ...DEFAULT_CUSTOM, ...s.custom } }; } catch { /* default */ }
  return { mode: "dark", custom: DEFAULT_CUSTOM };
}
export function applyTheme(t: ThemeSettings, save = true) {
  const el = document.documentElement;
  el.classList.toggle("dark", t.mode !== "light");
  for (const v of VARS) el.style.removeProperty(v);
  if (t.mode === "custom") for (const [k, v] of Object.entries(customVars(t.custom))) el.style.setProperty(k, v);
  if (save) localStorage.setItem(KEY, JSON.stringify(t));
}
