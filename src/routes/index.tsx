import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { ChevronDown, ChevronRight, FolderPlus, ImagePlus, Lock, MoreHorizontal, Pencil, Plus, RotateCcw, Search, Settings, Star, Trash2, FolderInput, Folder as FolderIcon, LayoutList } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Toaster } from "@/components/ui/sonner";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AccountAvatar, AccountSheet } from "@/components/AccountSheet";
import { DialogsProvider, useDialogs } from "@/components/dialogs";
import { FinderFolder } from "@/components/FinderFolder";
import { ImageCropper, pickImageFile } from "@/components/ImageCropper";
import { SettingsPanel } from "@/components/SettingsPanel";
import { I18nProvider, useI18n } from "@/lib/i18n";
import { applyTheme, loadTheme } from "@/lib/theme";
import { type Dir, deviceDir, loadVault, syncChanges } from "@/lib/vault/storage";
import {
  type Entry, type Folder, type Vault, deleteFolder, emptyTrash, folderPath, folderPreviewImages, liveEntries, liveFolders, moveEntry, moveFolder,
  placeFolderBefore, purgeEntry, restoreEntry, restoreFolder, sortFolders, trashEntry, trashFolder, trashItems, uid, descendantIds,
} from "@/lib/vault/types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cofre — Gestor de contraseñas privado" },
      { name: "description", content: "Guarda cada contraseña cifrada en su propio archivo, en tu propio dispositivo." },
      { property: "og:title", content: "Cofre — Gestor de contraseñas privado" },
      { property: "og:description", content: "Contraseñas cifradas, carpetas, favoritos y copias de seguridad, solo en tu dispositivo." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <I18nProvider><DialogsProvider><App /></DialogsProvider><Toaster /></I18nProvider>,
});

type DirPickerWin = { showDirectoryPicker?: (o?: object) => Promise<Dir> };

function App() {
  const { t } = useI18n();
  const [vault, setVault] = useState<Vault | null>(null);
  const [master, setMaster] = useState("");
  const [dir, setDir] = useState<Dir | null>(null);
  const saved = useRef<Vault | null>(null);
  useEffect(() => applyTheme(loadTheme(), false), []);
  useEffect(() => {
    if (!vault || !dir || !saved.current || saved.current === vault) return;
    const prev = saved.current; saved.current = vault;
    syncChanges(dir, prev, vault, master).catch(() => toast.error(t("saveFailed")));
  }, [vault, master, dir, t]);

  if (!vault || !dir) return <Unlock onOpen={(v, m, d) => { saved.current = v; setMaster(m); setDir(d); setVault(v); }} />;
  return <Main vault={vault} setVault={setVault} master={master} onLock={() => { setVault(null); setMaster(""); setDir(null); saved.current = null; }} />;
}

function Unlock({ onOpen }: { onOpen: (v: Vault, m: string, d: Dir) => void }) {
  const { t } = useI18n();
  const [pw, setPw] = useState("");
  const [canPickFolder, setCanPickFolder] = useState(false);
  useEffect(() => setCanPickFolder(!!(window as unknown as DirPickerWin).showDirectoryPicker && window.self === window.top), []);
  const okPw = () => { if (pw.length < 8) { toast.error(t("pwTooShort")); return false; } return true; };
  const openDir = async (d: Dir) => { try { onOpen(await loadVault(d, pw), pw, d); } catch { toast.error(t("wrongPw")); } };
  const openDevice = async () => { if (okPw()) await openDir(await deviceDir()); };
  const openFolder = async () => {
    if (!okPw()) return;
    let d: Dir;
    try { d = await (window as unknown as DirPickerWin).showDirectoryPicker!({ mode: "readwrite", id: "cofre" }); } catch { return; }
    await openDir(d);
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3"><div className="rounded-xl bg-primary p-3 text-primary-foreground"><Lock className="h-6 w-6" /></div><div><h1 className="text-2xl font-semibold">Cofre</h1><p className="text-sm text-muted-foreground">{t("tagline")}</p></div></div>
        <Input type="password" placeholder={t("masterPw")} aria-label={t("masterPw")} value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && openDevice()} />
        <Button className="mt-4 w-full" onClick={openDevice}><Lock className="mr-2 h-4 w-4" />{t("openDevice")}</Button>
        {canPickFolder && <Button variant="outline" className="mt-2 w-full" onClick={openFolder}><FolderIcon className="mr-2 h-4 w-4" />{t("useMacFolder")}</Button>}
        <p className="mt-6 text-xs text-muted-foreground">{t("unlockHelp")}</p>
      </div>
    </div>
  );
}

type Tab = "all" | "fav" | "trash" | "settings";
const DT = "text/x-cofre";

function Main({ vault, setVault, master, onLock }: { vault: Vault; setVault: (v: Vault) => void; master: string; onLock: () => void }) {
  const { t } = useI18n();
  const { confirm, prompt } = useDialogs();
  const [tab, setTab] = useState<Tab>("all");
  const [folder, setFolder] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState<{ entry: Entry; isNew: boolean } | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [folderCrop, setFolderCrop] = useState<{ id: string; src: string } | null>(null);
  const [moving, setMoving] = useState<{ kind: "f" | "e"; id: string } | null>(null);
  const [over, setOver] = useState<{ id: string; zone: "before" | "inside" } | null>(null);

  const folders = useMemo(() => liveFolders(vault), [vault]);
  const entries = useMemo(() => liveEntries(vault), [vault]);
  const path = folderPath(vault.folders, folder);
  useEffect(() => { if (folder && !folders.some((f) => f.id === folder)) setFolder(null); }, [folder, folders]);

  const childFolders = (pid: string | null) => sortFolders(folders.filter((f) => f.parentId === pid));
  const childEntries = (pid: string | null) => entries.filter((e) => e.folderId === pid).sort((a, b) => a.service.localeCompare(b.service));
  const countIn = (id: string) => { const ids = new Set(descendantIds(folders, id)); return entries.filter((e) => e.folderId && ids.has(e.folderId)).length; };
  const updateFolder = (id: string, p: Partial<Folder>) => setVault({ ...vault, folders: vault.folders.map((f) => (f.id === id ? { ...f, ...p } : f)) });
  const updateEntry = (e: Entry) => setVault({ ...vault, entries: vault.entries.some((x) => x.id === e.id) ? vault.entries.map((x) => (x.id === e.id ? e : x)) : [...vault.entries, e] });

  const newFolder = async () => {
    const name = await prompt({ title: t("newFolder"), message: t("folderName"), confirmLabel: t("save") });
    if (name) { setVault({ ...vault, folders: [...vault.folders, { id: uid(), name, parentId: folder }] }); if (folder) setExpanded(new Set(expanded).add(folder)); }
  };
  const newAccount = () => setOpen({ isNew: true, entry: { id: uid(), folderId: folder, service: "", link: "", image: "", usernames: [""], emails: [""], phones: [], passwords: [""], notes: "", updatedAt: Date.now() } });
  const doMove = (kind: "f" | "e", id: string, target: string | null) => {
    if (kind === "e") { setVault(moveEntry(vault, id, target)); toast.success(t("moved")); return; }
    if (id === target) return;
    const v = moveFolder(vault, id, target);
    if (!v) { toast.error(t("cantMoveInside")); return; }
    setVault(v); toast.success(t("moved"));
  };

  const folderActions = (f: Folder) => ({
    fav: () => updateFolder(f.id, { favorite: !f.favorite }),
    rename: async () => { const n = await prompt({ title: t("rename"), initial: f.name, confirmLabel: t("save") }); if (n) updateFolder(f.id, { name: n }); },
    image: async () => { const src = await pickImageFile(); if (src) setFolderCrop({ id: f.id, src }); },
    removeImage: async () => { if (await confirm({ title: t("removeImage"), message: t("confirmDeleteImage", { name: f.name }), confirmLabel: t("delete"), danger: true })) updateFolder(f.id, { image: undefined }); },
    move: () => setMoving({ kind: "f", id: f.id }),
    trash: async () => { if (await confirm({ title: t("delete"), message: t("confirmDeleteFolder", { name: f.name }), confirmLabel: t("delete"), danger: true })) { setVault(trashFolder(vault, f.id)); toast.success(t("movedToTrash")); } },
  });

  // Drag and drop (desktop): onto a folder = put inside; onto its top edge = reorder.
  const onDragStart = (kind: "f" | "e", id: string) => (ev: DragEvent) => { ev.dataTransfer.setData(DT, `${kind}:${id}`); ev.dataTransfer.effectAllowed = "move"; };
  const zoneOf = (ev: DragEvent, allowBefore: boolean) => { const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); return allowBefore && ev.clientY - r.top < r.height * 0.3 ? "before" : "inside"; };
  const dropOnFolder = (f: Folder) => ({
    onDragOver: (ev: DragEvent) => { if (!ev.dataTransfer.types.includes(DT)) return; ev.preventDefault(); setOver({ id: f.id, zone: zoneOf(ev, true) }); },
    onDragLeave: () => setOver(null),
    onDrop: (ev: DragEvent) => {
      ev.preventDefault(); setOver(null);
      const [kind, id] = ev.dataTransfer.getData(DT).split(":") as ["f" | "e", string];
      if (!id) return;
      if (kind === "f" && zoneOf(ev, true) === "before") { const v = placeFolderBefore(vault, id, f.id); if (v) setVault(v); else toast.error(t("cantMoveInside")); return; }
      doMove(kind, id, f.id);
    },
  });
  const dropOnLevel = (target: string | null) => ({
    onDragOver: (ev: DragEvent) => { if (ev.dataTransfer.types.includes(DT)) ev.preventDefault(); },
    onDrop: (ev: DragEvent) => { ev.preventDefault(); const [kind, id] = ev.dataTransfer.getData(DT).split(":") as ["f" | "e", string]; if (id) doMove(kind, id, target); },
  });

  const FolderRow = ({ f, depth, tree = true }: { f: Folder; depth: number; tree?: boolean }) => {
    const a = folderActions(f);
    const isOpen = expanded.has(f.id);
    const hasKids = folders.some((x) => x.parentId === f.id) || entries.some((e) => e.folderId === f.id);
    return (
      <>
        <div draggable onDragStart={onDragStart("f", f.id)} {...dropOnFolder(f)}
          className={cn("group flex items-center gap-2 border-b px-2 py-2 last:border-b-0 hover:bg-accent/60",
            over?.id === f.id && over.zone === "inside" && "bg-primary/15", over?.id === f.id && over.zone === "before" && "border-t-2 border-t-primary")}
          style={{ paddingLeft: 8 + depth * 22 }}>
          {tree ? (
            <button className={cn("rounded p-1 text-muted-foreground", !hasKids && "invisible")} aria-label={isOpen ? t("collapse") : t("expand")}
              onClick={() => { const n = new Set(expanded); if (isOpen) n.delete(f.id); else n.add(f.id); setExpanded(n); }}>
              {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </button>
          ) : <span className="w-1" />}
          <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => { setTab("all"); setQ(""); setFolder(f.id); }}>
            <FinderFolder image={f.image} images={folderPreviewImages(vault, f.id)} className="w-11" />
            <div className="min-w-0">
              <div className="truncate font-medium">{f.name}</div>
              <div className="text-xs text-muted-foreground">{t("accountsCount", { n: countIn(f.id) })}</div>
            </div>
          </button>
          {f.favorite && <Star className="h-4 w-4 fill-current text-yellow-500" aria-label={t("favorites")} />}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`${t("more")}: ${f.name}`}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={a.fav}><Star className="h-4 w-4" />{f.favorite ? t("removeFavorite") : t("addFavorite")}</DropdownMenuItem>
              <DropdownMenuItem onClick={a.rename}><Pencil className="h-4 w-4" />{t("rename")}</DropdownMenuItem>
              <DropdownMenuItem onClick={a.image}><ImagePlus className="h-4 w-4" />{f.image ? t("changeImage") : t("addImage")}</DropdownMenuItem>
              {f.image && <DropdownMenuItem onClick={a.removeImage}><Trash2 className="h-4 w-4" />{t("removeImage")}</DropdownMenuItem>}
              <DropdownMenuItem onClick={a.move}><FolderInput className="h-4 w-4" />{t("moveTo")}</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={a.trash}><Trash2 className="h-4 w-4" />{t("delete")}</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        {tree && isOpen && <Level parent={f.id} depth={depth + 1} />}
      </>
    );
  };

  const EntryRow = ({ e, depth = 0, showPath }: { e: Entry; depth?: number; showPath?: boolean }) => (
    <div draggable onDragStart={onDragStart("e", e.id)} className="flex items-center gap-2 border-b px-2 py-2 last:border-b-0 hover:bg-accent/60" style={{ paddingLeft: 8 + depth * 22 + 28 }}>
      <button className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => setOpen({ entry: e, isNew: false })}>
        <AccountAvatar e={e} />
        <div className="min-w-0">
          <div className="truncate font-medium">{e.service || t("untitled")}</div>
          <div className="truncate text-xs text-muted-foreground">
            {showPath ? folderPath(vault.folders, e.folderId).map((f) => f.name).join(" › ") || t("noFolder") : e.usernames.find(Boolean) || e.emails.find(Boolean) || e.link}
          </div>
        </div>
      </button>
      {e.favorite && <Star className="h-4 w-4 fill-current text-yellow-500" aria-label={t("favorites")} />}
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </div>
  );

  const Level = ({ parent, depth }: { parent: string | null; depth: number }) => (
    <>
      {childFolders(parent).map((f) => <FolderRow key={f.id} f={f} depth={depth} />)}
      {childEntries(parent).map((e) => <EntryRow key={e.id} e={e} depth={depth} />)}
    </>
  );

  const ql = q.trim().toLowerCase();
  const results = ql ? {
    folders: folders.filter((f) => f.name.toLowerCase().includes(ql)),
    entries: entries.filter((e) => [e.service, e.link, ...e.usernames, ...e.emails, ...e.phones, e.notes].join(" ").toLowerCase().includes(ql)),
  } : null;
  const trash = trashItems(vault);

  const tabs: { id: Tab; label: string; icon: typeof Star }[] = [
    { id: "all", label: t("all"), icon: LayoutList }, { id: "fav", label: t("favorites"), icon: Star },
    { id: "trash", label: t("trash"), icon: Trash2 }, { id: "settings", label: t("settings"), icon: Settings },
  ];
  const List = ({ children }: { children: React.ReactNode }) => <div className="overflow-hidden rounded-xl border bg-card">{children}</div>;
  const Empty = ({ text }: { text: string }) => <p className="py-12 text-center text-sm text-muted-foreground">{text}</p>;

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-6">
      <header className="sticky top-0 z-20 border-b bg-background/85 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          <div className="flex items-center gap-2 font-semibold"><Lock className="h-5 w-5 text-primary" />Cofre</div>
          <div className="relative ml-auto max-w-xs flex-1">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder={t("search")} aria-label={t("search")} value={q} onChange={(e) => { setQ(e.target.value); if (e.target.value) setTab("all"); }} />
          </div>
          <Button variant="ghost" size="icon" aria-label={t("lock")} title={t("lock")} onClick={onLock}><Lock className="h-4 w-4" /></Button>
        </div>
        <nav className="mx-auto mt-3 hidden max-w-3xl grid-cols-4 gap-1 rounded-lg bg-muted p-1 sm:grid">
          {tabs.map((x) => <button key={x.id} onClick={() => setTab(x.id)} className={cn("flex items-center justify-center gap-1.5 rounded-md py-1.5 text-sm", tab === x.id ? "bg-card font-medium shadow" : "text-muted-foreground")}><x.icon className="h-4 w-4" />{x.label}</button>)}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl p-4">
        {tab === "all" && results && (
          results.folders.length + results.entries.length === 0 ? <Empty text={t("nothingFound")} /> :
            <List>{results.folders.map((f) => <FolderRow key={f.id} f={f} depth={0} tree={false} />)}{results.entries.map((e) => <EntryRow key={e.id} e={e} showPath />)}</List>
        )}
        {tab === "all" && !results && (
          <>
            <nav className="mb-3 flex flex-wrap items-center gap-1 text-sm" aria-label={t("location")}>
              <button className="rounded px-2 py-1 hover:bg-accent" onClick={() => setFolder(null)} {...dropOnLevel(null)}>{t("all")}</button>
              {path.map((f) => <span key={f.id} className="flex items-center"><ChevronRight className="h-4 w-4 text-muted-foreground" /><button className="rounded px-2 py-1 hover:bg-accent" onClick={() => setFolder(f.id)} {...dropOnLevel(f.id)}>{f.name}</button></span>)}
            </nav>
            <div className="mb-3 flex gap-2">
              <Button onClick={newAccount}><Plus className="h-4 w-4" />{t("newAccount")}</Button>
              <Button variant="outline" onClick={newFolder}><FolderPlus className="h-4 w-4" />{t("newFolder")}</Button>
            </div>
            {childFolders(folder).length + childEntries(folder).length === 0 ? <Empty text={t("emptyFolder")} /> : <List><Level parent={folder} depth={0} /></List>}
            {folders.length > 1 && <p className="mt-3 hidden text-xs text-muted-foreground sm:block">{t("dragHintFolders")}</p>}
          </>
        )}
        {tab === "fav" && (() => {
          const ff = folders.filter((f) => f.favorite), fe = entries.filter((e) => e.favorite);
          return ff.length + fe.length === 0 ? <Empty text={t("noFavorites")} /> : <List>{ff.map((f) => <FolderRow key={f.id} f={f} depth={0} tree={false} />)}{fe.map((e) => <EntryRow key={e.id} e={e} showPath />)}</List>;
        })()}
        {tab === "trash" && (
          trash.folders.length + trash.entries.length === 0 ? <Empty text={t("trashEmpty")} /> : (
            <>
              <List>
                {[...trash.folders.map((f) => ({ kind: "f" as const, id: f.id, name: f.name, node: <FinderFolder image={f.image} images={folderPreviewImages(vault, f.id)} className="w-11" /> })),
                  ...trash.entries.map((e) => ({ kind: "e" as const, id: e.id, name: e.service || t("untitled"), node: <AccountAvatar e={e} /> }))].map((it) => (
                  <div key={it.id} className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0">
                    {it.node}<div className="min-w-0 flex-1 truncate font-medium">{it.name}</div>
                    <Button variant="ghost" size="icon" aria-label={`${t("restore")}: ${it.name}`} title={t("restore")} onClick={() => { setVault(it.kind === "f" ? restoreFolder(vault, it.id) : restoreEntry(vault, it.id)); toast.success(t("restored")); }}><RotateCcw className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" className="text-destructive" aria-label={`${t("deleteForever")}: ${it.name}`} title={t("deleteForever")} onClick={async () => {
                      if (await confirm({ title: t("deleteForever"), message: t("confirmPurge", { name: it.name }), confirmLabel: t("deleteForever"), danger: true })) setVault(it.kind === "f" ? deleteFolder(vault, it.id) : purgeEntry(vault, it.id));
                    }}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
              </List>
              <Button variant="outline" className="mt-4 w-full text-destructive" onClick={async () => {
                if (await confirm({ title: t("emptyTrashBtn"), message: t("confirmEmptyTrash"), confirmLabel: t("deleteForever"), danger: true })) setVault(emptyTrash(vault));
              }}><Trash2 className="h-4 w-4" />{t("emptyTrashBtn")}</Button>
            </>
          )
        )}
        {tab === "settings" && <SettingsPanel vault={vault} master={master} onImport={(v) => { setFolder(null); setVault(v); }} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t bg-background/90 pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden">
        {tabs.map((x) => <button key={x.id} onClick={() => setTab(x.id)} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px]", tab === x.id ? "text-primary" : "text-muted-foreground")}><x.icon className="h-5 w-5" />{x.label}</button>)}
      </nav>

      {open && (() => {
        const current = vault.entries.find((x) => x.id === open.entry.id) ?? open.entry;
        return <AccountSheet key={current.id} entry={current} isNew={open.isNew} vault={vault} onClose={() => setOpen(null)}
          onSave={(e) => { updateEntry(e); setOpen({ entry: e, isNew: false }); toast.success(t("saved")); }}
          onToggleFavorite={() => updateEntry({ ...current, favorite: !current.favorite })}
          onTrash={() => { setVault(trashEntry(vault, current.id)); setOpen(null); toast.success(t("movedToTrash")); }} />;
      })()}
      {folderCrop && <ImageCropper src={folderCrop.src} onCancel={() => setFolderCrop(null)} onDone={(r) => { updateFolder(folderCrop.id, { image: r.image }); setFolderCrop(null); }} />}
      {moving && <MovePicker vault={vault} moving={moving} onClose={() => setMoving(null)} onPick={(target) => { doMove(moving.kind, moving.id, target); setMoving(null); }} />}
    </div>
  );
}

function MovePicker({ vault, moving, onPick, onClose }: { vault: Vault; moving: { kind: "f" | "e"; id: string }; onPick: (id: string | null) => void; onClose: () => void }) {
  const { t } = useI18n();
  const blocked = new Set(moving.kind === "f" ? descendantIds(vault.folders, moving.id) : []);
  const opts = liveFolders(vault).filter((f) => !blocked.has(f.id)).map((f) => ({ id: f.id, f, label: folderPath(vault.folders, f.id).map((x) => x.name).join(" › ") })).sort((a, b) => a.label.localeCompare(b.label));
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-background/70 p-4 backdrop-blur sm:items-center" onClick={onClose}>
      <div className="max-h-[70vh] w-full max-w-sm overflow-y-auto rounded-2xl border bg-card p-2 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <h2 className="px-3 py-2 font-semibold">{t("moveTo")}</h2>
        <button className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent" onClick={() => onPick(null)}><LayoutList className="h-5 w-5" />{t("topLevel")}</button>
        {opts.map((o) => <button key={o.id} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-accent" onClick={() => onPick(o.id)}><FinderFolder image={o.f.image} className="w-8" /><span className="truncate">{o.label}</span></button>)}
        <Button variant="ghost" className="mt-1 w-full" onClick={onClose}>{t("cancel")}</Button>
      </div>
    </div>
  );
}
