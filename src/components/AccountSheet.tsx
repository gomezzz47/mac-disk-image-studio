import { useState } from "react";
import { ChevronLeft, Copy, ExternalLink, Eye, EyeOff, ImagePlus, Plus, Star, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useDialogs } from "@/components/dialogs";
import { ImageCropper, pickImageFile, type CropResult } from "@/components/ImageCropper";
import { useI18n, type TFn } from "@/lib/i18n";
import { generatePassword } from "@/lib/vault/crypto";
import { folderPath, liveFolders, sortFolders, type Entry, type Vault } from "@/lib/vault/types";
import { urlSuggestions } from "@/lib/url";
import { cn } from "@/lib/utils";

type ListKey = "usernames" | "emails" | "phones" | "passwords";
const LISTS: { key: ListKey; field: "fieldUser" | "fieldEmail" | "fieldPhone" | "fieldPassword"; type: string }[] = [
  { key: "usernames", field: "fieldUser", type: "text" },
  { key: "emails", field: "fieldEmail", type: "email" },
  { key: "phones", field: "fieldPhone", type: "tel" },
  { key: "passwords", field: "fieldPassword", type: "password" },
];

export function AccountAvatar({ e, size = "md" }: { e: Pick<Entry, "image" | "service">; size?: "sm" | "md" | "lg" }) {
  const s = { sm: "h-9 w-9 text-sm rounded-lg", md: "h-10 w-10 rounded-xl", lg: "h-20 w-20 text-3xl rounded-2xl" }[size];
  return e.image
    ? <img src={e.image} alt="" className={cn(s, "shrink-0 object-cover shadow-sm")} />
    : <div className={cn(s, "flex shrink-0 items-center justify-center bg-secondary font-semibold text-secondary-foreground")}>{(e.service.trim()[0] || "?").toUpperCase()}</div>;
}

const copy = async (v: string, t: TFn) => { try { await navigator.clipboard.writeText(v); toast.success(t("copied")); } catch { toast.error(v); } };
const href = (link: string) => (/^[a-z][a-z0-9+.-]*:\/\//i.test(link) ? link : `https://${link}`);

export function AccountSheet({ entry, isNew, vault, onSave, onTrash, onToggleFavorite, onClose }: {
  entry: Entry; isNew: boolean; vault: Vault; onSave: (e: Entry) => void; onTrash: () => void; onToggleFavorite: () => void; onClose: () => void;
}) {
  const { t } = useI18n();
  const [editing, setEditing] = useState(isNew);
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-background/60 backdrop-blur-sm" onClick={onClose}>
      <div className="flex h-full w-full max-w-lg flex-col border-l bg-background shadow-2xl" onClick={(x) => x.stopPropagation()}>
        {editing
          ? <EditForm entry={entry} vault={vault} onCancel={() => (isNew ? onClose() : setEditing(false))} onSave={(e) => { onSave(e); setEditing(false); }} />
          : <ViewMode entry={entry} vault={vault} t={t} onEdit={() => setEditing(true)} onTrash={onTrash} onToggleFavorite={onToggleFavorite} onClose={onClose} />}
      </div>
    </div>
  );
}

function ViewMode({ entry: e, vault, t, onEdit, onTrash, onToggleFavorite, onClose }: { entry: Entry; vault: Vault; t: TFn; onEdit: () => void; onTrash: () => void; onToggleFavorite: () => void; onClose: () => void }) {
  const { confirm } = useDialogs();
  const path = folderPath(vault.folders, e.folderId).map((f) => f.name).join(" › ") || t("noFolder");
  const rows = LISTS.flatMap(({ key }) => e[key].filter((v) => v.trim()).map((v) => ({ key, v, label: t(key) })));
  return (
    <>
      <header className="flex items-center justify-between border-b px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="sm" onClick={onClose}><ChevronLeft className="h-4 w-4" />{t("back")}</Button>
        <Button variant="ghost" size="sm" className="font-semibold text-primary" onClick={onEdit}>{t("edit")}</Button>
      </header>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="mb-6 flex flex-col items-center text-center">
          <AccountAvatar e={e} size="lg" />
          <div className="mt-3 flex items-center gap-2">
            <h2 className="text-2xl font-semibold">{e.service || t("untitled")}</h2>
            <button aria-label={e.favorite ? t("removeFavorite") : t("addFavorite")} title={e.favorite ? t("removeFavorite") : t("addFavorite")} onClick={onToggleFavorite}>
              <Star className={cn("h-5 w-5", e.favorite ? "fill-current text-yellow-500" : "text-muted-foreground")} />
            </button>
          </div>
          {e.link && <a href={href(e.link)} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm text-primary">{e.link}<ExternalLink className="h-3 w-3" /></a>}
        </div>
        {rows.length > 0 && (
          <div className="divide-y overflow-hidden rounded-xl border bg-card">
            {rows.map((r, i) => <Row key={i} label={r.label} value={r.v} secret={r.key === "passwords"} t={t} />)}
          </div>
        )}
        {e.notes.trim() && (
          <div className="mt-4 rounded-xl border bg-card p-4">
            <div className="mb-1 text-xs text-muted-foreground">{t("notes")}</div>
            <p className="whitespace-pre-wrap text-sm">{e.notes}</p>
          </div>
        )}
        <div className="mt-4 rounded-xl border bg-card p-4">
          <div className="text-xs text-muted-foreground">{t("location")}</div>
          <div className="text-sm">{path}</div>
        </div>
        <Button variant="ghost" className="mt-6 w-full text-destructive hover:text-destructive" onClick={async () => {
          if (await confirm({ title: t("deleteAccount"), message: t("confirmDeleteAccount", { name: e.service || t("untitled") }), confirmLabel: t("delete"), danger: true })) onTrash();
        }}><Trash2 className="h-4 w-4" />{t("deleteAccount")}</Button>
      </div>
    </>
  );
}

function Row({ label, value, secret, t }: { label: string; value: string; secret?: boolean; t: TFn }) {
  const [show, setShow] = useState(false);
  return (
    <div className="flex items-center gap-2 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className={cn("truncate", secret && "font-mono")}>{secret && !show ? "••••••••••" : value}</div>
      </div>
      {secret && (
        <Button variant="ghost" size="icon" aria-label={show ? t("hide") : t("show")} title={show ? t("hide") : t("show")} onClick={() => setShow(!show)}>
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </Button>
      )}
      <Button variant="ghost" size="icon" aria-label={`${t("copy")} ${label}`} title={t("copy")} onClick={() => copy(value, t)}><Copy className="h-4 w-4" /></Button>
    </div>
  );
}

function EditForm({ entry, vault, onCancel, onSave }: { entry: Entry; vault: Vault; onCancel: () => void; onSave: (e: Entry) => void }) {
  const { t } = useI18n();
  const { confirm } = useDialogs();
  const [e, setE] = useState<Entry>(() => ({ ...entry, usernames: [...entry.usernames], emails: [...entry.emails], phones: [...entry.phones], passwords: [...entry.passwords] }));
  const [crop, setCrop] = useState<{ src: string; crop?: Entry["imageCrop"] } | null>(null);
  const [showPw, setShowPw] = useState(false);
  const set = (p: Partial<Entry>) => setE((x) => ({ ...x, ...p }));
  const folders = sortFolders(liveFolders(vault)).map((f) => ({ id: f.id, label: folderPath(vault.folders, f.id).map((x) => x.name).join(" › ") })).sort((a, b) => a.label.localeCompare(b.label));
  const sugg = urlSuggestions(e.link);

  const editImage = async () => {
    if (e.imageSrc || e.image) return setCrop({ src: e.imageSrc || e.image, crop: e.imageSrc ? e.imageCrop : undefined });
    const src = await pickImageFile(); if (src) setCrop({ src });
  };
  const removeItem = async (key: ListKey, field: Parameters<TFn>[0], i: number) => {
    const value = e[key][i] ?? "";
    if (value.trim() && !(await confirm({ title: t("delete"), message: t("confirmDeleteField", { field: t(field), value: key === "passwords" ? "••••••" : value }), confirmLabel: t("delete"), danger: true }))) return;
    set({ [key]: e[key].filter((_, j) => j !== i) } as Partial<Entry>);
  };

  return (
    <>
      <header className="flex items-center justify-between border-b px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <Button variant="ghost" size="sm" onClick={onCancel}>{t("cancel")}</Button>
        <Button size="sm" onClick={() => onSave({ ...e, updatedAt: Date.now() })}>{t("save")}</Button>
      </header>
      <div className="flex-1 overflow-y-auto p-5">
        <div className="mb-6 flex flex-col items-center gap-2">
          <button onClick={editImage} aria-label={e.image ? t("changeImage") : t("addImage")} className="relative">
            <AccountAvatar e={e} size="lg" />
            <span className="absolute -bottom-1 -right-1 rounded-full border bg-card p-1"><ImagePlus className="h-3.5 w-3.5" /></span>
          </button>
          {e.image && (
            <button className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive" onClick={async () => {
              if (await confirm({ title: t("removeImage"), message: t("confirmDeleteImage", { name: e.service || t("untitled") }), confirmLabel: t("delete"), danger: true })) set({ image: "", imageSrc: undefined, imageCrop: undefined });
            }}><Trash2 className="h-3 w-3" />{t("removeImage")}</button>
          )}
        </div>
        <Field label={t("service")}><Input value={e.service} onChange={(x) => set({ service: x.target.value })} /></Field>
        <Field label={t("link")}>
          <Input inputMode="url" autoCapitalize="none" autoCorrect="off" placeholder="https://" value={e.link} onChange={(x) => set({ link: x.target.value })} />
          {sugg.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sugg.map((s) => <button key={s} type="button" className="rounded-full border bg-card px-2.5 py-1 text-xs hover:border-primary" onClick={() => set({ link: s })}>{s}</button>)}
            </div>
          )}
        </Field>
        <Field label={t("folder")}>
          <select className="h-9 w-full rounded-md border bg-background px-2 text-sm" value={e.folderId ?? ""} onChange={(x) => set({ folderId: x.target.value || null })}>
            <option value="">{t("noFolder")}</option>
            {folders.map((f) => <option key={f.id} value={f.id}>{f.label}</option>)}
          </select>
        </Field>
        {LISTS.map(({ key, field, type }) => (
          <Field key={key} label={t(key)}>
            <div className="grid gap-2">
              {e[key].map((v, i) => (
                <div key={i} className="flex gap-1">
                  <Input aria-label={`${t(key)} ${i + 1}`} type={type === "password" && !showPw ? "password" : type === "password" ? "text" : type} autoCapitalize="none" value={v} className={type === "password" ? "font-mono" : ""}
                    onChange={(x) => set({ [key]: e[key].map((y, j) => (j === i ? x.target.value : y)) } as Partial<Entry>)} />
                  {type === "password" && <Button size="icon" variant="ghost" aria-label={t("generate")} title={t("generate")} onClick={() => set({ passwords: e.passwords.map((y, j) => (j === i ? generatePassword() : y)) })}><Wand2 className="h-4 w-4" /></Button>}
                  <Button size="icon" variant="ghost" className="text-muted-foreground hover:text-destructive" aria-label={`${t("delete")} ${t(field)}`} title={t("delete")} onClick={() => removeItem(key, field, i)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => set({ [key]: [...e[key], ""] } as Partial<Entry>)}><Plus className="h-3 w-3" />{t("add")}</Button>
                {type === "password" && e.passwords.length > 0 && (
                  <Button size="icon" variant="ghost" aria-label={showPw ? t("hide") : t("show")} title={showPw ? t("hide") : t("show")} onClick={() => setShowPw(!showPw)}>{showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button>
                )}
              </div>
            </div>
          </Field>
        ))}
        <Field label={t("notes")}><Textarea rows={5} value={e.notes} onChange={(x) => set({ notes: x.target.value })} /></Field>
      </div>
      {crop && <ImageCropper src={crop.src} crop={crop.crop} onCancel={() => setCrop(null)} onDone={(r: CropResult) => { set({ image: r.image, imageSrc: r.src, imageCrop: r.crop }); setCrop(null); }} />}
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="mb-4"><div className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>{children}</div>;
}
