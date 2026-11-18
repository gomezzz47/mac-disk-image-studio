import { describe, it, expect } from "vitest";
import { encryptText, decryptText } from "./crypto";
import { deleteFolder } from "./types";

describe("cofre", () => {
  it("solo se descifra con la contraseña maestra correcta", async () => {
    const c = await encryptText("secreto", "maestra");
    expect(c).not.toContain("secreto");
    expect(await decryptText(c, "maestra")).toBe("secreto");
    await expect(decryptText(c, "otra")).rejects.toThrow();
  });
  it("borrar una carpeta borra sus subcarpetas y cuentas", () => {
    const v = deleteFolder({
      folders: [{ id: "a", name: "Stream", parentId: null }, { id: "b", name: "Spotify", parentId: "a" }, { id: "c", name: "Otro", parentId: null }],
      entries: [{ id: "e", folderId: "b" } as never, { id: "f", folderId: "c" } as never],
    }, "a");
    expect(v.folders.map((f) => f.id)).toEqual(["c"]);
    expect(v.entries.map((e) => e.id)).toEqual(["f"]);
  });
});

import { loadVault, syncChanges, type Dir } from "./storage";
function memDir() {
  const files = new Map<string, string>();
  const dir: Dir = {
    name: "m",
    getFileHandle: async (n, o) => { if (!files.has(n) && !o?.create) throw new Error("nf"); return { getFile: async () => ({ text: async () => files.get(n) ?? "" }) as File, createWritable: async () => { let d = ""; return { write: async (x: string) => { d = x; }, close: async () => { files.set(n, d); } }; } }; },
    removeEntry: async (n) => { files.delete(n); },
    values: async function* () { for (const name of files.keys()) yield { kind: "file", name }; },
  };
  return { dir, files };
}
describe("carpeta local", () => {
  it("guarda un archivo cifrado por cuenta y lo borra al eliminarla", async () => {
    const { dir, files } = memDir();
    const v0 = await loadVault(dir, "maestra123");
    const e = { id: "x1", folderId: null, service: "Spotify", link: "", image: "", usernames: [], emails: [], phones: [], passwords: ["p"], notes: "", updatedAt: 0 };
    const v1 = { ...v0, entries: [e] };
    await syncChanges(dir, v0, v1, "maestra123");
    expect(files.has("x1.cofre")).toBe(true);
    expect(files.get("x1.cofre")).not.toContain("Spotify");
    expect((await loadVault(dir, "maestra123")).entries[0]?.service).toBe("Spotify");
    await expect(loadVault(dir, "mala")).rejects.toThrow();
    await syncChanges(dir, v1, v0, "maestra123");
    expect(files.has("x1.cofre")).toBe(false);
  });
});
