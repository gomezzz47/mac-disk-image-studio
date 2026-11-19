// Local folder storage: one encrypted file per account plus an encrypted folder index.
import { decryptText, encryptText } from "./crypto";
import type { Entry, Folder, Vault } from "./types";

export type Dir = {
  name: string;
  getFileHandle: (n: string, o?: { create?: boolean }) => Promise<{ getFile: () => Promise<File>; createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }> }>;
  removeEntry: (n: string) => Promise<void>;
  values: () => AsyncIterable<{ kind: string; name: string }>;
};
export const INDEX = "_carpetas.cofre";
export const entryFile = (id: string) => `${id}.cofre`;

async function write(dir: Dir, name: string, text: string) {
  const h = await dir.getFileHandle(name, { create: true });
  const s = await h.createWritable(); await s.write(text); await s.close();
}
const read = async (dir: Dir, name: string) => (await (await dir.getFileHandle(name)).getFile()).text();

/** Opens the folder; creates a new vault when it has no index. Throws on wrong password. */
export async function loadVault(dir: Dir, pw: string): Promise<Vault> {
  const names: string[] = [];
  for await (const f of dir.values()) if (f.kind === "file" && f.name.endsWith(".cofre")) names.push(f.name);
  if (!names.includes(INDEX)) {
    if (names.length) throw new Error("Falta el índice de carpetas");
    await saveFolders(dir, [], pw);
    return { folders: [], entries: [] };
  }
  const folders: Folder[] = JSON.parse(await decryptText(await read(dir, INDEX), pw));
  const entries: Entry[] = [];
  for (const n of names) if (n !== INDEX) entries.push(JSON.parse(await decryptText(await read(dir, n), pw)));
  return { folders, entries };
}
export const saveFolders = async (dir: Dir, f: Folder[], pw: string) => write(dir, INDEX, await encryptText(JSON.stringify(f), pw));
export const saveEntry = async (dir: Dir, e: Entry, pw: string) => write(dir, entryFile(e.id), await encryptText(JSON.stringify(e), pw));
export const removeEntry = (dir: Dir, id: string) => dir.removeEntry(entryFile(id)).catch(() => {});

/** Writes only what changed between two vault states. */
export async function syncChanges(dir: Dir, prev: Vault, next: Vault, pw: string) {
  if (prev.folders !== next.folders) await saveFolders(dir, next.folders, pw);
  const old = new Map(prev.entries.map((e) => [e.id, e]));
  for (const e of next.entries) if (old.get(e.id) !== e) await saveEntry(dir, e, pw);
  const ids = new Set(next.entries.map((e) => e.id));
  for (const e of prev.entries) if (!ids.has(e.id)) await removeEntry(dir, e.id);
}

/** Private folder on this device (iPhone, iPad or inside the preview), backed by IndexedDB. Same file layout. */
export async function deviceDir(): Promise<Dir> {
  const db: IDBDatabase = await new Promise((res, rej) => {
    const r = indexedDB.open("cofre", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("files");
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
  const tx = <T,>(mode: IDBTransactionMode, f: (s: IDBObjectStore) => IDBRequest<T>) =>
    new Promise<T>((res, rej) => { const q = f(db.transaction("files", mode).objectStore("files")); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
  return {
    name: "Este dispositivo",
    getFileHandle: async (n, o) => {
      const cur = await tx<string | undefined>("readonly", (s) => s.get(n));
      if (cur === undefined && !o?.create) throw new Error("No existe");
      return {
        getFile: async () => ({ text: async () => (await tx<string | undefined>("readonly", (s) => s.get(n))) ?? "" }) as File,
        createWritable: async () => { let d = ""; return { write: async (x: string) => { d = x; }, close: async () => { await tx("readwrite", (s) => s.put(d, n)); } }; },
      };
    },
    removeEntry: async (n) => { await tx("readwrite", (s) => s.delete(n)); },
    values: async function* () { const keys = await tx<IDBValidKey[]>("readonly", (s) => s.getAllKeys()); for (const k of keys) yield { kind: "file", name: String(k) }; },
  };
}
