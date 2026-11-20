// Encrypted backup: one file with every encrypted account file and the folder index, plus a SHA-256 checksum.
import { decryptText, encryptText } from "./crypto";
import type { Entry, Folder, Vault } from "./types";

export const BACKUP_MAGIC = "COFRE-BACKUP-1";
type Backup = { m: string; created: number; index: string; entries: string[]; sha256: string };

async function sha256(text: string) {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return Array.from(h, (b) => b.toString(16).padStart(2, "0")).join("");
}
const body = (b: Pick<Backup, "index" | "entries">) => JSON.stringify([b.index, b.entries]);

export async function createBackup(v: Vault, pw: string, now = Date.now()): Promise<string> {
  const index = await encryptText(JSON.stringify(v.folders), pw);
  const entries = await Promise.all(v.entries.map((e) => encryptText(JSON.stringify(e), pw)));
  return JSON.stringify({ m: BACKUP_MAGIC, created: now, index, entries, sha256: await sha256(body({ index, entries })) } satisfies Backup);
}

export class BackupError extends Error { constructor(public kind: "invalid" | "password") { super(kind); } }

/** Checks the file is intact, then decrypts it. Throws BackupError("invalid" | "password"). */
export async function readBackup(text: string, pw: string): Promise<Vault & { created: number }> {
  let b: Backup;
  try { b = JSON.parse(text); } catch { throw new BackupError("invalid"); }
  if (b?.m !== BACKUP_MAGIC || typeof b.index !== "string" || !Array.isArray(b.entries)) throw new BackupError("invalid");
  if ((await sha256(body(b))) !== b.sha256) throw new BackupError("invalid");
  let folders: Folder[];
  try { folders = JSON.parse(await decryptText(b.index, pw)); } catch { throw new BackupError("password"); }
  const entries: Entry[] = [];
  for (const e of b.entries) { try { entries.push(JSON.parse(await decryptText(e, pw))); } catch { throw new BackupError("invalid"); } }
  return { folders, entries, created: b.created };
}
