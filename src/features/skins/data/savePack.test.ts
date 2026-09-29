import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { saveSkinPack, skinFileName } from "./savePack";
const bridge = vi.hoisted(() => ({ isTauri: vi.fn(() => true), invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => bridge);
afterEach(() => { bridge.invoke.mockReset(); bridge.isTauri.mockReturnValue(true); });
it("sends bounded binary data and only a suggested filename, never a destination", async () => {
  const bytes = new Uint8Array(100); bridge.invoke.mockResolvedValue(true);
  await expect(saveSkinPack(bytes, "My / skin")).resolves.toBe(true);
  expect(bridge.invoke).toHaveBeenCalledWith("save_skin_pack", bytes, { headers: { "x-skin-name": "notsu-My-skin.notsuskin" } });
  expect(skinFileName("CON")).toBe("notsu-CON.notsuskin");
});
it("distinguishes cancellation and write errors without reporting successful saves", async () => {
  bridge.invoke.mockResolvedValue(false); await expect(saveSkinPack(new Uint8Array(100), "Skin")).resolves.toBe(false);
  bridge.invoke.mockRejectedValue("The disk is full."); await expect(saveSkinPack(new Uint8Array(100), "Skin")).rejects.toThrow("disk is full");
});
it("rejects oversized data or browser calls before invoking native code", async () => {
  await expect(saveSkinPack(new Uint8Array(16 * 1024 * 1024 + 1), "Skin")).rejects.toThrow("16 MB");
  bridge.isTauri.mockReturnValue(false); await expect(saveSkinPack(new Uint8Array(100), "Skin")).rejects.toThrow("browser download");
  expect(bridge.invoke).not.toHaveBeenCalled();
});
it("grants only the bounded export command to the local main window", () => {
  const capability = JSON.parse(readFileSync(new URL("../../../../src-tauri/capabilities/default.json", import.meta.url), "utf8"));
  expect(capability.windows).toEqual(["main"]); expect(capability.remote).toBeUndefined();
  expect(capability.permissions).toEqual(["allow-save-skin-pack", "allow-save-map-pack"]);
});
