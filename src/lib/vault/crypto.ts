// AES-GCM encryption with a key derived from the master password (PBKDF2-SHA256).
const enc = new TextEncoder();
const dec = new TextDecoder();
const ITER = 310000;
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password: string, salt: Uint8Array) {
  const base = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: salt as BufferSource, iterations: ITER, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

export const FILE_MAGIC = "COFRE1";

export async function encryptText(plain: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc.encode(plain)));
  return JSON.stringify({ m: FILE_MAGIC, s: b64(salt), i: b64(iv), d: b64(data) });
}

export async function decryptText(payload: string, password: string): Promise<string> {
  const p = JSON.parse(payload);
  if (p.m !== FILE_MAGIC) throw new Error("Archivo no válido");
  const key = await deriveKey(password, unb64(p.s));
  const out = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(p.i) }, key, unb64(p.d));
  return dec.decode(out);
}

export function generatePassword(len = 20) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_+=?";
  const r = crypto.getRandomValues(new Uint32Array(len));
  return Array.from(r, (n) => chars[n % chars.length]).join("");
}
