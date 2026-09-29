import { afterEach, expect, it, vi } from "vitest";
import { mapFileName, saveMapPack } from "./savePack";
const bridge = vi.hoisted(() => ({ isTauri: vi.fn(() => true), invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => bridge);
afterEach(() => { bridge.invoke.mockReset(); bridge.isTauri.mockReturnValue(true); });
it("saves through the bounded map command with no filesystem destination in IPC", async () => {
  const bytes = new Uint8Array(100); bridge.invoke.mockResolvedValue(true);
  await expect(saveMapPack(bytes, "Our / map")).resolves.toBe(true);
  expect(bridge.invoke).toHaveBeenCalledWith("save_map_pack", bytes, { headers: { "x-map-name": "notsu-Our-map.notsumap" } });
  expect(mapFileName("CON")).toBe("notsu-CON.notsumap");
});
it("distinguishes cancellation, errors, browser downloads and size failures", async () => {
  bridge.invoke.mockResolvedValue(false); await expect(saveMapPack(new Uint8Array(100), "map")).resolves.toBe(false);
  bridge.invoke.mockRejectedValue("Disk is full"); await expect(saveMapPack(new Uint8Array(100), "map")).rejects.toThrow("Disk is full");
  await expect(saveMapPack(new Uint8Array(128 * 1024 * 1024 + 1), "map")).rejects.toThrow("128 MB");
  bridge.isTauri.mockReturnValue(false); await expect(saveMapPack(new Uint8Array(100), "map")).rejects.toThrow("browser download");
});
