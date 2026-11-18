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
