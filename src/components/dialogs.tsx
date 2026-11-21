import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { useI18n } from "@/lib/i18n";

type Req = { kind: "confirm" | "prompt"; title: string; message?: string; confirmLabel?: string; danger?: boolean; initial?: string; password?: boolean };
type Api = { confirm: (r: Omit<Req, "kind">) => Promise<boolean>; prompt: (r: Omit<Req, "kind">) => Promise<string | null> };
const Ctx = createContext<Api | null>(null);
export const useDialogs = () => useContext(Ctx)!;

export function DialogsProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [req, setReq] = useState<Req | null>(null);
  const [value, setValue] = useState("");
  const resolver = useRef<(v: unknown) => void>(() => {});
  const open = <T,>(r: Req) => new Promise<T>((res) => { resolver.current = res as (v: unknown) => void; setValue(r.initial ?? ""); setReq(r); });
  const finish = (ok: boolean) => {
    const r = req; setReq(null);
    resolver.current(r?.kind === "prompt" ? (ok && value.trim() ? value.trim() : null) : ok);
  };
  return (
    <Ctx.Provider value={{ confirm: (r) => open<boolean>({ ...r, kind: "confirm" }), prompt: (r) => open<string | null>({ ...r, kind: "prompt" }) }}>
      {children}
      <AlertDialog open={!!req} onOpenChange={(o) => !o && finish(false)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{req?.title}</AlertDialogTitle>
            {req?.message && <AlertDialogDescription>{req.message}</AlertDialogDescription>}
          </AlertDialogHeader>
          {req?.kind === "prompt" && (
            <Input autoFocus type={req.password ? "password" : "text"} value={value} onChange={(e) => setValue(e.target.value)} onKeyDown={(e) => e.key === "Enter" && finish(true)} />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => finish(false)}>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction className={req?.danger ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""} onClick={(e) => { e.preventDefault(); finish(true); }}>
              {req?.confirmLabel ?? t("continue")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Ctx.Provider>
  );
}
