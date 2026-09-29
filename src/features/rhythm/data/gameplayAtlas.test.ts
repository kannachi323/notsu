import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import manifest from "../assets/gameplay-atlas-v1.json";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it("keeps every measured frame and pivot inside the actual PNG atlas", () => {
  const bytes = readFileSync(new URL("../assets/gameplay-atlas-v1.png", import.meta.url));
  expect(bytes.readUInt32BE(16)).toBe(manifest.imageWidth);
  expect(bytes.readUInt32BE(20)).toBe(manifest.imageHeight);
  expect(Object.keys(manifest.sprites)).toHaveLength(12);
  for (const frame of Object.values(manifest.sprites)) {
    expect(frame.x).toBeGreaterThanOrEqual(0); expect(frame.y).toBeGreaterThanOrEqual(0);
    expect(frame.x + frame.width).toBeLessThanOrEqual(manifest.imageWidth);
    expect(frame.y + frame.height).toBeLessThanOrEqual(manifest.imageHeight);
    expect(frame.pivotX).toBeGreaterThan(0); expect(frame.pivotX).toBeLessThan(frame.width);
    expect(frame.pivotY).toBeGreaterThan(0); expect(frame.pivotY).toBeLessThan(frame.height);
    expect(frame.bodyWidth).toBeLessThanOrEqual(frame.width); expect(frame.bodyHeight).toBeLessThanOrEqual(frame.height);
  }
});
it("decodes one image for concurrent requests", async () => {
  const decode = vi.fn(async () => {});
  vi.stubGlobal("Image", class { src = ""; naturalWidth = manifest.imageWidth; naturalHeight = manifest.imageHeight; decode = decode; });
  const atlas = await import("./gameplayAtlas");
  await Promise.all([atlas.loadGameplayAtlas(), atlas.loadGameplayAtlas()]);
  expect(decode).toHaveBeenCalledOnce(); expect(atlas.gameplayAtlas()).toBeDefined();
});
it.each(["corrupt", "dimensions"])("retains fallback drawing for %s images", async reason => {
  vi.stubGlobal("Image", class { src = ""; naturalWidth = 1; naturalHeight = 1;
    async decode() { if (reason === "corrupt") throw new Error("bad image"); }
  });
  const atlas = await import("./gameplayAtlas");
  await expect(atlas.loadGameplayAtlas()).resolves.toBeUndefined();
  expect(atlas.gameplayAtlas()).toBeUndefined();
});
