import { describe, it, expect } from "vitest";
import { createBackup, readBackup } from "./backup";
import { emptyTrash, liveEntries, moveFolder, placeFolderBefore, restoreFolder, trashFolder, trashItems, type Entry, type Vault } from "./types";
import { urlSuggestions } from "../url";

const e = (id: string, folderId: string | null): Entry => ({ id, folderId, service: id, link: "", image: "", usernames: [], emails: [], phones: [], passwords: ["x"], notes: "", updatedAt: 0 });
const base = (): Vault => ({
  folders: [{ id: "stream", name: "Stream", parentId: null }, { id: "spoti", name: "Spotify", parentId: "stream" }, { id: "otros", name: "Otros", parentId: null }],
  entries: [e("cuenta1", "spoti"), e("cuenta2", "otros")],
});

describe("papelera", () => {
  it("borrar una carpeta la manda a la papelera con todo su contenido, sin perder nada", () => {
    const v = trashFolder(base(), "stream");
    expect(liveEntries(v).map((x) => x.id)).toEqual(["cuenta2"]);
    expect(trashItems(v).folders.map((f) => f.id)).toEqual(["stream"]);
    const r = restoreFolder(v, "stream");
    expect(liveEntries(r).map((x) => x.id)).toEqual(["cuenta1", "cuenta2"]);
    expect(r.folders.find((f) => f.id === "spoti")?.parentId).toBe("stream");
  });
  it("vaciar la papelera borra para siempre solo lo que está en ella", () => {
    const v = emptyTrash(trashFolder(base(), "stream"));
    expect(v.folders.map((f) => f.id)).toEqual(["otros"]);
    expect(v.entries.map((x) => x.id)).toEqual(["cuenta2"]);
  });
});

describe("organizar carpetas", () => {
  it("no deja meter una carpeta dentro de sí misma", () => {
    expect(moveFolder(base(), "stream", "spoti")).toBeNull();
  });
  it("mover una carpeta conserva sus subcarpetas y cuentas", () => {
    const v = moveFolder(base(), "stream", "otros")!;
    expect(v.folders.find((f) => f.id === "stream")?.parentId).toBe("otros");
    expect(v.entries.find((x) => x.id === "cuenta1")?.folderId).toBe("spoti");
  });
  it("reordenar coloca la carpeta justo antes de la otra", () => {
    const v = placeFolderBefore(base(), "otros", "stream")!;
    const top = v.folders.filter((f) => f.parentId === null).sort((a, b) => a.order! - b.order!).map((f) => f.id);
    expect(top).toEqual(["otros", "stream"]);
  });
});

describe("copia de seguridad", () => {
  it("recupera cuentas y carpetas, y va cifrada", async () => {
    const txt = await createBackup(base(), "maestra123");
    expect(txt).not.toContain("Spotify");
    const r = await readBackup(txt, "maestra123");
    expect(r.folders.find((f) => f.id === "spoti")?.parentId).toBe("stream");
    expect(r.entries).toHaveLength(2);
  });
  it("rechaza una copia modificada o con contraseña incorrecta", async () => {
    const txt = await createBackup(base(), "maestra123");
    const bad = JSON.parse(txt); bad.entries.pop();
    await expect(readBackup(JSON.stringify(bad), "maestra123")).rejects.toMatchObject({ kind: "invalid" });
    await expect(readBackup(txt, "otraclave")).rejects.toMatchObject({ kind: "password" });
  });
});

describe("sugerencias de web", () => {
  it("sugiere https:// y .com/.es/.it sin tocar direcciones correctas", () => {
    expect(urlSuggestions("spotify")).toEqual(["https://spotify.com", "https://spotify.es", "https://spotify.it"]);
    expect(urlSuggestions("spotify.com")).toEqual(["https://spotify.com"]);
    expect(urlSuggestions("https://spotify.com/login")).toEqual([]);
  });
});
