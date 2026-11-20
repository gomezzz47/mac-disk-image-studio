/** Suggestions for the website field. Never rewrites what the user typed. */
export function urlSuggestions(input: string): string[] {
  const v = input.trim();
  if (!v || /\s/.test(v)) return [];
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(v);
  const rest = hasScheme ? v.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "") : v;
  const host = rest.split(/[/?#]/)[0] ?? "";
  const hasTld = /\.[a-z]{2,}$/i.test(host);
  if (hasScheme && hasTld) return [];
  const base = hasScheme ? v : `https://${v}`;
  if (hasTld) return [base];
  if (!host || host.endsWith(".")) return [];
  const path = rest.slice(host.length);
  const scheme = hasScheme ? v.slice(0, v.length - rest.length) : "https://";
  return [".com", ".es", ".it"].map((tld) => `${scheme}${host}${tld}${path}`);
}
