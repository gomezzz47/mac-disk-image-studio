import { useState } from "react";
import { Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDialogs } from "@/components/dialogs";
import { FinderFolder } from "@/components/FinderFolder";
import { LANGS, useI18n, type Lang } from "@/lib/i18n";
import { applyTheme, clamp255, customVars, loadTheme, type CustomColors, type RGB, type ThemeMode } from "@/lib/theme";
import { BackupError, createBackup, readBackup } from "@/lib/vault/backup";
import { liveEntries, liveFolders, type Vault } from "@/lib/vault/types";
import { cn } from "@/lib/utils";

export function SettingsPanel({ vault, master, onImport }: { vault: Vault; master: string; onImport: (v: Vault) => void }) {
  const { t, lang, setLang } = useI18n();
  return (
    <div className="grid gap-6">
      <Section title={t("appearance")}><ThemeSettings /></Section>
      <Section title={t("language")}>
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {LANGS.map((l) => (
            <button key={l.code} onClick={() => setLang(l.code as Lang)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent">
              <span>{l.label}</span>{lang === l.code && <span className="text-primary">✓</span>}
            </button>
          ))}
        </div>
      </Section>
      <Section title={t("backup")}><BackupSettings vault={vault} master={master} onImport={onImport} /></Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2 className="mb-2 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>{children}</section>;
}

function ThemeSettings() {
  const { t } = useI18n();
  const [s, setS] = useState(loadTheme);
  const [draft, setDraft] = useState<CustomColors>(s.custom);
  const pick = (mode: ThemeMode) => { const n = { ...s, mode }; setS(n); if (mode !== "custom") applyTheme(n); };
  const keys: { k: keyof CustomColors; label: string }[] = [
    { k: "bg", label: t("colorBg") }, { k: "surface", label: t("colorSurface") }, { k: "accent", label: t("colorAccent") }, { k: "text", label: t("colorText") },
  ];
  const setC = (k: keyof CustomColors, i: number, v: string) => setDraft((d) => { const c = [...d[k]] as RGB; c[i] = clamp255(Number(v)); return { ...d, [k]: c }; });
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        {(["light", "dark", "custom"] as ThemeMode[]).map((m) => (
          <button key={m} onClick={() => pick(m)} className={cn("rounded-md py-1.5 text-sm", s.mode === m ? "bg-card font-medium shadow" : "text-muted-foreground")}>{t(m)}</button>
        ))}
      </div>
      {s.mode === "custom" && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="grid gap-3">
            {keys.map(({ k, label }) => (
              <div key={k}>
                <div className="mb-1 flex items-center gap-2 text-sm"><span className="h-4 w-4 rounded border" style={{ background: `rgb(${draft[k].join(" ")})` }} />{label}</div>
                <div className="grid grid-cols-3 gap-1">
                  {["R", "G", "B"].map((ch, i) => (
                    <label key={ch} className="relative">
                      <span className="absolute left-2 top-2 text-xs text-muted-foreground">{ch}</span>
                      <Input aria-label={`${label} ${ch}`} type="number" min={0} max={255} className="pl-6" value={draft[k][i]} onChange={(e) => setC(k, i, e.target.value)} />
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div>
            <div className="mb-1 text-sm">{t("preview")}</div>
            <div data-testid="theme-preview" style={customVars(draft) as React.CSSProperties} className="overflow-hidden rounded-xl border bg-background text-foreground">
              <div className="border-b bg-card px-3 py-2 text-sm font-semibold">Cofre</div>
              <div className="grid gap-2 p-3">
                <div className="flex items-center gap-2 rounded-lg border bg-card p-2 text-sm"><FinderFolder className="w-8" />Stream<span className="ml-auto text-xs text-muted-foreground">3</span></div>
                <div className="flex items-center gap-2 rounded-lg border bg-card p-2 text-sm"><span className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-xs">S</span>{t("sampleAccount")}</div>
                <div className="rounded-md bg-primary px-3 py-1.5 text-center text-xs text-primary-foreground">{t("save")}</div>
              </div>
            </div>
            <Button className="mt-3 w-full" onClick={() => { const n = { mode: "custom" as const, custom: draft }; setS(n); applyTheme(n); toast.success(t("themeApplied")); }}>{t("apply")}</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function BackupSettings({ vault, master, onImport }: { vault: Vault; master: string; onImport: (v: Vault) => void }) {
  const { t, lang } = useI18n();
  const { confirm, prompt } = useDialogs();
  const exportIt = async () => {
    const text = await createBackup(vault, master);
    const name = `Cofre-copia-${new Date().toISOString().slice(0, 10)}.cofrebackup`;
    const file = new File([text], name, { type: "application/octet-stream" });
    const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
    if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
      try { await nav.share({ files: [file], title: name }); toast.success(t("exported")); } catch { /* cancelado */ }
      return;
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast.success(t("exported"));
  };
  const importIt = () => {
    const i = document.createElement("input"); i.type = "file"; i.accept = ".cofrebackup,application/octet-stream,application/json";
    i.onchange = async () => {
      const f = i.files?.[0]; if (!f) return;
      const text = await f.text();
      let data;
      try { data = await readBackup(text, master); }
      catch (err) {
        if (!(err instanceof BackupError) || err.kind === "invalid") { toast.error(t("backupInvalid")); return; }
        const pw = await prompt({ title: t("importBackup"), message: t("backupPwHelp"), password: true });
        if (!pw) return;
        try { data = await readBackup(text, pw); } catch (e2) { toast.error(e2 instanceof BackupError && e2.kind === "password" ? t("wrongBackupPw") : t("backupInvalid")); return; }
      }
      const ok = await confirm({
        title: t("importBackup"), confirmLabel: t("continue"), danger: true,
        message: t("confirmImport", { a: liveEntries(vault).length, f: liveFolders(vault).length, a2: data.entries.filter((e) => !e.deletedAt).length, f2: data.folders.filter((x) => !x.deletedAt).length, date: new Date(data.created).toLocaleString(lang) }),
      });
      if (!ok) return;
      onImport({ folders: data.folders, entries: data.entries });
      toast.success(t("importDone"));
    };
    i.click();
  };
  return (
    <div className="rounded-xl border bg-card p-4">
      <p className="mb-3 text-sm text-muted-foreground">{t("backupHelp")}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Button variant="outline" onClick={exportIt}><Download className="h-4 w-4" />{t("exportBackup")}</Button>
        <Button variant="outline" onClick={importIt}><Upload className="h-4 w-4" />{t("importBackup")}</Button>
      </div>
    </div>
  );
}
