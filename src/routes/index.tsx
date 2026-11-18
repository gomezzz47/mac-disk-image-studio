import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Copy, Eye, EyeOff, Folder as FolderIcon, FolderPlus, KeyRound, Lock, Plus, Search, Trash2, Wand2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { generatePassword } from "@/lib/vault/crypto";
import { type Dir, loadVault, syncChanges } from "@/lib/vault/storage";
import { type Entry, type Vault, deleteFolder, uid } from "@/lib/vault/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cofre — Gestor de contraseñas privado" },
      { name: "description", content: "Guarda cada contraseña cifrada en su propio archivo, en una carpeta de tu Mac." },
      { property: "og:title", content: "Cofre — Gestor de contraseñas privado" },
      { property: "og:description", content: "Contraseñas cifradas, carpetas anidadas y notas, guardadas en una carpeta de tu Mac." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: App,
});

type DirPickerWin = { showDirectoryPicker?: (o?: object) => Promise<Dir> };

function App() {
  const [vault, setVault] = useState<Vault | null>(null);
  const [master, setMaster] = useState("");
  const [dir, setDir] = useState<Dir | null>(null);
  const saved = useRef<Vault | null>(null);

  useEffect(() => {
    if (!vault || !dir || !saved.current || saved.current === vault) return;
    const prev = saved.current; saved.current = vault;
    syncChanges(dir, prev, vault, master).catch(() => toast.error("No se pudo guardar en la carpeta"));
  }, [vault, master, dir]);

  if (!vault || !dir) return <><Unlock onOpen={(v, m, d) => { saved.current = v; setMaster(m); setDir(d); setVault(v); }} /><Toaster /></>;
  return <><Main vault={vault} setVault={setVault} dirName={dir.name} onLock={() => { setVault(null); setMaster(""); setDir(null); saved.current = null; }} /><Toaster /></>;
}

function Unlock({ onOpen }: { onOpen: (v: Vault, m: string, d: Dir) => void }) {
  const [pw, setPw] = useState("");
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(!!(window as unknown as DirPickerWin).showDirectoryPicker), []);
  const openFolder = async () => {
    if (pw.length < 8) { toast.error("La contraseña maestra debe tener al menos 8 caracteres"); return; }
    let d: Dir;
    try { d = await (window as unknown as DirPickerWin).showDirectoryPicker!({ mode: "readwrite", id: "cofre" }); } catch { return; }
    try { onOpen(await loadVault(d, pw), pw, d); } catch { toast.error("Contraseña maestra incorrecta o carpeta no válida"); }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3"><div className="rounded-xl bg-primary p-3 text-primary-foreground"><Lock className="h-6 w-6" /></div><div><h1 className="text-2xl font-semibold">Cofre</h1><p className="text-sm text-muted-foreground">Tus contraseñas, solo tuyas</p></div></div>
        <Input type="password" placeholder="Contraseña maestra" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && openFolder()} />
        <Button className="mt-4 w-full" onClick={openFolder} disabled={!supported}><FolderIcon className="mr-2 h-4 w-4" />Abrir carpeta del cofre</Button>
        {!supported && <p className="mt-3 text-sm text-destructive">Este navegador no permite usar carpetas de tu Mac. Abre Cofre en Chrome o Edge.</p>}
        <p className="mt-6 text-xs text-muted-foreground">Elige una carpeta de tu Mac (vacía la primera vez). Cada cuenta se guarda en su propio archivo .cofre cifrado; nada sale de tu Mac. Si olvidas la contraseña maestra, no se puede recuperar.</p>
      </div>
    </div>
  );
}

function Main({ vault, setVault, dirName, onLock }: { vault: Vault; setVault: (v: Vault) => void; dirName: string; onLock: () => void }) {
  const [folder, setFolder] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const path = useMemo(() => { const p = []; let c = folder; while (c) { const f = vault.folders.find((x) => x.id === c); if (!f) break; p.unshift(f); c = f.parentId; } return p; }, [folder, vault.folders]);
  const subfolders = vault.folders.filter((f) => f.parentId === folder);
  const entries = q ? vault.entries.filter((e) => [e.service, e.link, ...e.usernames, ...e.emails].join(" ").toLowerCase().includes(q.toLowerCase())) : vault.entries.filter((e) => e.folderId === folder).sort((a, b) => a.service.localeCompare(b.service));

  const newFolder = () => { const name = prompt("Nombre de la carpeta"); if (name) setVault({ ...vault, folders: [...vault.folders, { id: uid(), name, parentId: folder }] }); };
  const rmFolder = (id: string, name: string) => { if (confirm(`¿Borrar «${name}» y todo lo que contiene?`)) setVault(deleteFolder(vault, id)); };
  const save = (e: Entry) => { const exists = vault.entries.some((x) => x.id === e.id); setVault({ ...vault, entries: exists ? vault.entries.map((x) => (x.id === e.id ? e : x)) : [...vault.entries, e] }); setEditing(null); toast.success("Guardado"); };
  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2 font-semibold"><Lock className="h-5 w-5 text-primary" />Cofre</div>
        <div className="relative ml-auto w-full max-w-xs flex-1"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <span className="hidden items-center gap-1 text-sm text-muted-foreground sm:flex"><FolderIcon className="h-4 w-4" />{dirName}</span>
        <Button variant="ghost" size="sm" onClick={onLock}><Lock className="h-4 w-4" />Bloquear</Button>
      </header>
      <main className="mx-auto max-w-4xl p-4">
        {!q && (
          <nav className="mb-4 flex flex-wrap items-center gap-1 text-sm">
            <button className="rounded px-2 py-1 hover:bg-accent" onClick={() => setFolder(null)}>Todo</button>
            {path.map((f) => <span key={f.id} className="flex items-center"><ChevronRight className="h-4 w-4 text-muted-foreground" /><button className="rounded px-2 py-1 hover:bg-accent" onClick={() => setFolder(f.id)}>{f.name}</button></span>)}
          </nav>
        )}
        <div className="mb-4 flex gap-2">
          <Button onClick={() => setEditing({ id: uid(), folderId: folder, service: "", link: "", image: "", usernames: [""], emails: [""], phones: [], passwords: [""], notes: "", updatedAt: Date.now() })}><Plus className="h-4 w-4" />Nueva contraseña</Button>
          <Button variant="outline" onClick={newFolder}><FolderPlus className="h-4 w-4" />Nueva carpeta</Button>
        </div>
        {!q && subfolders.length > 0 && (
          <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {subfolders.map((f) => (
              <div key={f.id} className="group relative cursor-pointer rounded-xl border bg-card p-4 hover:border-primary" onClick={() => setFolder(f.id)}>
                <FolderIcon className="mb-2 h-7 w-7 text-primary" /><div className="truncate font-medium">{f.name}</div>
                <div className="text-xs text-muted-foreground">{vault.entries.filter((e) => e.folderId === f.id).length} cuentas</div>
                <button className="absolute right-2 top-2 hidden text-muted-foreground hover:text-destructive group-hover:block" onClick={(e) => { e.stopPropagation(); rmFolder(f.id, f.name); }}><Trash2 className="h-4 w-4" /></button>
              </div>
            ))}
          </div>
        )}
        <div className="grid gap-2">
          {entries.map((e) => (
            <button key={e.id} onClick={() => setEditing(e)} className="flex items-center gap-3 rounded-xl border bg-card p-3 text-left hover:border-primary">
              <Avatar e={e} />
              <div className="min-w-0"><div className="truncate font-medium">{e.service || "Sin nombre"}</div><div className="truncate text-sm text-muted-foreground">{e.usernames[0] || e.emails[0] || e.link}</div></div>
            </button>
          ))}
          {entries.length === 0 && subfolders.length === 0 && <p className="py-12 text-center text-muted-foreground">{q ? "Nada encontrado" : "Esta carpeta está vacía"}</p>}
        </div>
      </main>
      {editing && <Editor entry={editing} vault={vault} onClose={() => setEditing(null)} onSave={save} onDelete={() => { setVault({ ...vault, entries: vault.entries.filter((x) => x.id !== editing.id) }); setEditing(null); }} />}
    </div>
  );
}

function Avatar({ e, big }: { e: Entry; big?: boolean }) {
  const s = big ? "h-16 w-16 text-2xl" : "h-10 w-10";
  return e.image ? <img src={e.image} alt="" className={`${s} shrink-0 rounded-lg object-cover`} /> : <div className={`${s} flex shrink-0 items-center justify-center rounded-lg bg-secondary font-semibold`}>{(e.service[0] || "?").toUpperCase()}</div>;
}

function Editor({ entry, vault, onClose, onSave, onDelete }: { entry: Entry; vault: Vault; onClose: () => void; onSave: (e: Entry) => void; onDelete: () => void }) {
  const [e, setE] = useState(entry);
  const set = (p: Partial<Entry>) => setE({ ...e, ...p });
  const pickImage = () => {
    const i = document.createElement("input"); i.type = "file"; i.accept = "image/*";
    i.onchange = () => { const f = i.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = () => {
      const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); c.width = c.height = 160; const x = c.getContext("2d")!; const m = Math.min(img.width, img.height); x.drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, 160, 160); set({ image: c.toDataURL("image/jpeg", 0.85) }); }; img.src = r.result as string; }; r.readAsDataURL(f); };
    i.click();
  };
  return (
    <div className="fixed inset-0 z-20 flex justify-end bg-background/70 backdrop-blur-sm" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto border-l bg-card p-6" onClick={(x) => x.stopPropagation()}>
        <div className="mb-6 flex items-center gap-4">
          <button onClick={pickImage} title="Cambiar imagen"><Avatar e={e} big /></button>
          <Input className="text-lg font-semibold" placeholder="Nombre del servicio" value={e.service} onChange={(x) => set({ service: x.target.value })} />
          <button onClick={onClose}><X className="h-5 w-5" /></button>
        </div>
        <Field label="Enlace"><Input placeholder="https://" value={e.link} onChange={(x) => set({ link: x.target.value })} /></Field>
        <Field label="Carpeta">
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={e.folderId ?? ""} onChange={(x) => set({ folderId: x.target.value || null })}>
            <option value="">(Sin carpeta)</option>
            {vault.folders.map((f) => <option key={f.id} value={f.id}>{folderPath(vault, f.id)}</option>)}
          </select>
        </Field>
        <List label="Usuarios" values={e.usernames} onChange={(v) => set({ usernames: v })} />
        <List label="Correos" values={e.emails} onChange={(v) => set({ emails: v })} type="email" />
        <List label="Números" values={e.phones} onChange={(v) => set({ phones: v })} type="tel" />
        <List label="Contraseñas" values={e.passwords} onChange={(v) => set({ passwords: v })} secret />
        <Field label="Notas"><Textarea rows={5} value={e.notes} onChange={(x) => set({ notes: x.target.value })} /></Field>
        <div className="mt-6 flex gap-2">
          <Button className="flex-1" onClick={() => onSave({ ...e, updatedAt: Date.now() })}>Guardar</Button>
          {vault.entries.some((x) => x.id === e.id) && <Button variant="destructive" onClick={() => confirm("¿Borrar esta cuenta?") && onDelete()}><Trash2 className="h-4 w-4" /></Button>}
        </div>
      </div>
    </div>
  );
}

function folderPath(v: Vault, id: string) { const p: string[] = []; let c: string | null = id; while (c) { const f = v.folders.find((x) => x.id === c); if (!f) break; p.unshift(f.name); c = f.parentId; } return p.join(" / "); }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="mb-4"><div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>{children}</div>; }

function List({ label, values, onChange, type = "text", secret }: { label: string; values: string[]; onChange: (v: string[]) => void; type?: string; secret?: boolean }) {
  const [show, setShow] = useState(false);
  const upd = (i: number, s: string) => onChange(values.map((x, j) => (j === i ? s : x)));
  return (
    <Field label={label}>
      <div className="grid gap-2">
        {values.map((v, i) => (
          <div key={i} className="flex gap-1">
            <Input type={secret && !show ? "password" : type} value={v} onChange={(x) => upd(i, x.target.value)} className="font-mono" />
            {secret && <Button size="icon" variant="ghost" title="Generar" onClick={() => upd(i, generatePassword())}><Wand2 className="h-4 w-4" /></Button>}
            <Button size="icon" variant="ghost" title="Copiar" onClick={() => { navigator.clipboard.writeText(v); toast.success("Copiado"); }}><Copy className="h-4 w-4" /></Button>
            <Button size="icon" variant="ghost" onClick={() => onChange(values.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onChange([...values, ""])}><Plus className="h-3 w-3" />Añadir</Button>
          {secret && <Button size="sm" variant="ghost" onClick={() => setShow(!show)}>{show ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}{show ? "Ocultar" : "Mostrar"}</Button>}
          {secret && <KeyRound className="hidden" />}
        </div>
      </div>
    </Field>
  );
}
