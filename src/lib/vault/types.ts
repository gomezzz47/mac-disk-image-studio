export type Folder = { id: string; name: string; parentId: string | null };
export type Entry = {
  id: string;
  folderId: string | null;
  service: string;
  link: string;
  image: string; // data URL
  usernames: string[];
  emails: string[];
  phones: string[];
  passwords: string[];
  notes: string;
  updatedAt: number;
};
export type Vault = { folders: Folder[]; entries: Entry[] };
export const emptyVault = (): Vault => ({ folders: [], entries: [] });
export const uid = () => crypto.randomUUID();

/** Ids of a folder and all its subfolders. */
export function descendantIds(folders: Folder[], id: string): string[] {
  const out = [id];
  for (const f of folders) if (f.parentId === id) out.push(...descendantIds(folders, f.id));
  return out;
}
export function deleteFolder(v: Vault, id: string): Vault {
  const ids = new Set(descendantIds(v.folders, id));
  return { folders: v.folders.filter((f) => !ids.has(f.id)), entries: v.entries.filter((e) => !e.folderId || !ids.has(e.folderId)) };
}
