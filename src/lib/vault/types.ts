export type Crop = { zoom: number; rot: number; x: number; y: number };
export type Folder = {
  id: string; name: string; parentId: string | null;
  order?: number | undefined; image?: string | undefined; favorite?: boolean | undefined; deletedAt?: number | undefined;
};
export type Entry = {
  id: string;
  folderId: string | null;
  service: string;
  link: string;
  image: string; // 1080x1080 result
  imageSrc?: string | undefined; // original photo, so re-editing never loses quality
  imageCrop?: Crop | undefined;
  usernames: string[];
  emails: string[];
  phones: string[];
  passwords: string[];
  notes: string;
  updatedAt: number;
  favorite?: boolean | undefined;
  deletedAt?: number | undefined;
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
/** Permanently removes a folder, its subfolders and their accounts. */
export function deleteFolder(v: Vault, id: string): Vault {
  const ids = new Set(descendantIds(v.folders, id));
  return { folders: v.folders.filter((f) => !ids.has(f.id)), entries: v.entries.filter((e) => !e.folderId || !ids.has(e.folderId)) };
}

/** True when the folder or any parent is in the trash. */
export function folderHidden(folders: Folder[], id: string | null): boolean {
  let c = id;
  const seen = new Set<string>();
  while (c && !seen.has(c)) {
    seen.add(c);
    const f = folders.find((x) => x.id === c);
    if (!f) return false;
    if (f.deletedAt) return true;
    c = f.parentId;
  }
  return false;
}
export const entryHidden = (v: Vault, e: Entry) => !!e.deletedAt || folderHidden(v.folders, e.folderId);
export const liveFolders = (v: Vault) => v.folders.filter((f) => !folderHidden(v.folders, f.id));
export const liveEntries = (v: Vault) => v.entries.filter((e) => !entryHidden(v, e));

export function sortFolders(list: Folder[]) {
  return [...list].sort((a, b) => (a.order ?? 1e9) - (b.order ?? 1e9) || a.name.localeCompare(b.name));
}

export const trashFolder = (v: Vault, id: string, now = Date.now()): Vault => ({ ...v, folders: v.folders.map((f) => (f.id === id ? { ...f, deletedAt: now } : f)) });
export const trashEntry = (v: Vault, id: string, now = Date.now()): Vault => ({ ...v, entries: v.entries.map((e) => (e.id === id ? { ...e, deletedAt: now } : e)) });

/** Restores a folder with all its content; goes to the top level if its parent is gone. */
export function restoreFolder(v: Vault, id: string): Vault {
  return {
    ...v,
    folders: v.folders.map((f) => {
      if (f.id !== id) return f;
      const parentOk = f.parentId && v.folders.some((p) => p.id === f.parentId) && !folderHidden(v.folders, f.parentId);
      return { ...f, deletedAt: undefined, parentId: parentOk ? f.parentId : null };
    }),
  };
}
export function restoreEntry(v: Vault, id: string): Vault {
  return {
    ...v,
    entries: v.entries.map((e) => {
      if (e.id !== id) return e;
      const folderOk = e.folderId && v.folders.some((f) => f.id === e.folderId) && !folderHidden(v.folders, e.folderId);
      return { ...e, deletedAt: undefined, folderId: folderOk ? e.folderId : null };
    }),
  };
}
export const purgeEntry = (v: Vault, id: string): Vault => ({ ...v, entries: v.entries.filter((e) => e.id !== id) });

/** Items shown in the trash: folders deleted directly (not inside another deleted folder) and accounts deleted directly. */
export function trashItems(v: Vault) {
  const folders = v.folders.filter((f) => f.deletedAt && !folderHidden(v.folders, f.parentId));
  const entries = v.entries.filter((e) => e.deletedAt && !folderHidden(v.folders, e.folderId));
  return { folders, entries };
}
export function emptyTrash(v: Vault): Vault {
  let out = v;
  const { folders, entries } = trashItems(v);
  for (const f of folders) out = deleteFolder(out, f.id);
  for (const e of entries) out = purgeEntry(out, e.id);
  return out;
}

/** Moves a folder inside another (null = top level). Returns null if it would go inside itself. */
export function moveFolder(v: Vault, id: string, parentId: string | null): Vault | null {
  if (parentId && descendantIds(v.folders, id).includes(parentId)) return null;
  return { ...v, folders: v.folders.map((f) => (f.id === id ? { ...f, parentId, order: undefined } : f)) };
}
/** Places a folder just before another one, in the same parent. */
export function placeFolderBefore(v: Vault, id: string, targetId: string): Vault | null {
  const target = v.folders.find((f) => f.id === targetId);
  if (!target || id === targetId) return null;
  const moved = moveFolder(v, id, target.parentId);
  if (!moved) return null;
  const siblings = sortFolders(moved.folders.filter((f) => f.parentId === target.parentId && f.id !== id && !f.deletedAt));
  const idx = siblings.findIndex((f) => f.id === targetId);
  const me = moved.folders.find((f) => f.id === id)!;
  siblings.splice(idx, 0, me);
  const order = new Map(siblings.map((f, i) => [f.id, i]));
  return { ...moved, folders: moved.folders.map((f) => (order.has(f.id) ? { ...f, order: order.get(f.id) } : f)) };
}
export const moveEntry = (v: Vault, id: string, folderId: string | null): Vault => ({ ...v, entries: v.entries.map((e) => (e.id === id ? { ...e, folderId } : e)) });

/** Up to 4 account pictures from a folder and its subfolders, for the folder icon. */
export function folderPreviewImages(v: Vault, id: string): string[] {
  const ids = new Set(descendantIds(v.folders, id));
  return v.entries.filter((e) => e.folderId && ids.has(e.folderId) && e.image && !e.deletedAt).slice(0, 4).map((e) => e.image);
}
export function folderPath(folders: Folder[], id: string | null): Folder[] {
  const p: Folder[] = [];
  let c = id;
  const seen = new Set<string>();
  while (c && !seen.has(c)) { seen.add(c); const f = folders.find((x) => x.id === c); if (!f) break; p.unshift(f); c = f.parentId; }
  return p;
}
