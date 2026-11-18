import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, Copy, Eye, EyeOff, Folder as FolderIcon, FolderPlus, KeyRound, Lock, Plus, Search, Trash2, Wand2, X, Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { decryptText, encryptText, generatePassword } from "@/lib/vault/crypto";
import { type Entry, type Vault, deleteFolder, emptyVault, uid } from "@/lib/vault/types";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cofre — Gestor de contraseñas privado" },
      { name: "description", content: "Guarda tus contraseñas cifradas en un archivo en iCloud Drive que solo Cofre puede abrir." },
      { property: "og:title", content: "Cofre — Gestor de contraseñas privado" },
      { property: "og:description", content: "Contraseñas cifradas, carpetas anidadas y notas, guardadas en tu iCloud Drive." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: App,
});

const LS = "cofre-copia";
type FileHandle = { createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }>; getFile: () => Promise<File>; name: string };
const w = () => window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileHandle>; showOpenFilePicker?: (o: object) => Promise<FileHandle[]> };
const pickerOpts = { types: [{ description: "Cofre cifrado", accept: { "application/octet-stream": [".cofre"] } }] };

function App() {
  const [vault, setVault] = useState<Vault | null>(null);
  const [master, setMaster] = useState("");
  const [handle, setHandle] = useState<FileHandle | null>(null);
  const first = useRef(true);

  useEffect(() => {
    if (!vault) return;
    if (first.current) { first.current = false; return; }
    const t = setTimeout(async () => {
      const data = await encryptText(JSON.stringify(vault), master);
      localStorage.setItem(LS, data);
      if (handle) { const s = await handle.createWritable(); await s.write(data); await s.close(); }
    }, 400);
    return () => clearTimeout(t);
  }, [vault, master, handle]);

  if (!vault) return <><Unlock onOpen={(v, m, h) => { first.current = true; setMaster(m); setHandle(h); setVault(v); }} /><Toaster /></>;
  return <><Main vault={vault} setVault={setVault} handle={handle} setHandle={setHandle} master={master} onLock={() => { setVault(null); setMaster(""); setHandle(null); }} /><Toaster /></>;
}

function Unlock({ onOpen }: { onOpen: (v: Vault, m: string, h: FileHandle | null) => void }) {
  const [pw, setPw] = useState("");
  const [hasLocal, setHasLocal] = useState(false);
  useEffect(() => setHasLocal(!!localStorage.getItem(LS)), []);
  const open = async (text: string, h: FileHandle | null) => {
    try { onOpen(JSON.parse(await decryptText(text, pw)), pw, h); } catch { toast.error("Contraseña maestra incorrecta o archivo dañado"); }
  };
  const needPw = () => { if (pw.length < 8) { toast.error("La contraseña maestra debe tener al menos 8 caracteres"); return false; } return true; };
  const create = async () => {
    if (!needPw()) return;
    let h: FileHandle | null = null;
    if (w().showSaveFilePicker) { try { h = await w().showSaveFilePicker!({ suggestedName: "MiCofre.cofre", ...pickerOpts }); } catch { return; } }
    const v = emptyVault();
    if (h) { const s = await h.createWritable(); await s.write(await encryptText(JSON.stringify(v), pw)); await s.close(); }
    onOpen(v, pw, h);
  };
  const openFile = async () => {
    if (!needPw()) return;
    if (w().showOpenFilePicker) {
      try { const [h] = await w().showOpenFilePicker!(pickerOpts); if (h) await open(await (await h.getFile()).text(), h); } catch { /* cancelado */ }
    } else {
      const i = document.createElement("input"); i.type = "file"; i.accept = ".cofre";
      i.onchange = async () => { const f = i.files?.[0]; if (f) await open(await f.text(), null); }; i.click();
    }
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-sm rounded-2xl border bg-card p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-3"><div className="rounded-xl bg-primary p-3 text-primary-foreground"><Lock className="h-6 w-6" /></div><div><h1 className="text-2xl font-semibold">Cofre</h1><p className="text-sm text-muted-foreground">Tus contraseñas, solo tuyas</p></div></div>
        <Input type="password" placeholder="Contraseña maestra" value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && hasLocal && open(localStorage.getItem(LS)!, null)} />
        <div className="mt-4 grid gap-2">
          {hasLocal && <Button onClick={() => open(localStorage.getItem(LS)!, null)}>Desbloquear último cofre</Button>}
          <Button variant={hasLocal ? "outline" : "default"} onClick={openFile}><Upload className="mr-2 h-4 w-4" />Abrir cofre de iCloud Drive</Button>
          <Button variant="outline" onClick={create}><Plus className="mr-2 h-4 w-4" />Crear cofre nuevo</Button>
        </div>
        <p className="mt-6 text-xs text-muted-foreground">Guarda el archivo .cofre en tu carpeta de iCloud Drive. Está cifrado: sin tu contraseña maestra nadie puede leerlo. Si la olvidas, no se puede recuperar.</p>
      </div>
    </div>
  );
}

function Main({ vault, setVault, handle, setHandle, master, onLock }: { vault: Vault; setVault: (v: Vault) => void; handle: FileHandle | null; setHandle: (h: FileHandle) => void; master: string; onLock: () => void }) {
  const [folder, setFolder] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const path = useMemo(() => { const p = []; let c = folder; while (c) { const f = vault.folders.find((x) => x.id === c); if (!f) break; p.unshift(f); c = f.parentId; } return p; }, [folder, vault.folders]);
  const subfolders = vault.folders.filter((f) => f.parentId === folder);
  const entries = q ? vault.entries.filter((e) => [e.service, e.link, ...e.usernames, ...e.emails].join(" ").toLowerCase().includes(q.toLowerCase())) : vault.entries.filter((e) => e.folderId === folder);

  const newFolder = () => { const name = prompt("Nombre de la carpeta"); if (name) setVault({ ...vault, folders: [...vault.folders, { id: uid(), name, parentId: folder }] }); };
  const rmFolder = (id: string, name: string) => { if (confirm(`¿Borrar «${name}» y todo lo que contiene?`)) setVault(deleteFolder(vault, id)); };
  const save = (e: Entry) => { const exists = vault.entries.some((x) => x.id === e.id); setVault({ ...vault, entries: exists ? vault.entries.map((x) => (x.id === e.id ? e : x)) : [...vault.entries, e] }); setEditing(null); toast.success("Guardado"); };
  const exportFile = async () => {
    const data = await encryptText(JSON.stringify(vault), master);
    if (w().showSaveFilePicker) { try { const h = await w().showSaveFilePicker!({ suggestedName: "MiCofre.cofre", ...pickerOpts }); const s = await h.createWritable(); await s.write(data); await s.close(); setHandle(h); toast.success("Guardado en " + h.name); } catch { /* cancelado */ } return; }
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([data])); a.download = "MiCofre.cofre"; a.click();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b bg-background/90 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2 font-semibold"><Lock className="h-5 w-5 text-primary" />Cofre</div>
        <div className="relative ml-auto w-full max-w-xs flex-1"><Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Buscar" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <Button variant="outline" size="sm" onClick={exportFile} title={handle ? "Sincronizado con " + handle.name : "Guardar en iCloud Drive"}><Download className="h-4 w-4" /><span className="hidden sm:inline">{handle ? handle.name : "Guardar en iCloud"}</span></Button>
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
