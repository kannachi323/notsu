import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { packSkin, unpackSkin } from "./archive";
import { loadSkinAssets, parseSkinPack, pngDimensions } from "./loadPack";
import atlas from "../../rhythm/assets/gameplay-atlas-v1.json";
const png = new Uint8Array(readFileSync(new URL("../../rhythm/assets/gameplay-atlas-v1.png", import.meta.url)));
vi.mock("./archiveClient", () => ({ archiveJob: async ({ bytes }: { bytes: Uint8Array }) => unpackSkin(bytes) }));
afterEach(() => vi.unstubAllGlobals());
const manifest = { format: "notsu-skin", version: 1, name: "Pack", author: "Player", base: "midnight" };
const pack = (change: object, files: Record<string, Uint8Array> = {}) => packSkin({ "skin.json": new TextEncoder().encode(JSON.stringify({ ...manifest, ...change })), ...files });
it("identifies packs from their bytes and handles malformed manifests", async () => {
  const bytes = pack({}); const a = await parseSkinPack(bytes), b = await parseSkinPack(bytes);
  expect(a.id).toMatch(/^skin:[a-f0-9]{64}$/); expect(a.id).toBe(b.id);
  expect((await parseSkinPack(pack({ name: "Different" }))).id).not.toBe(a.id);
  await expect(parseSkinPack(pack({ version: 42 }))).rejects.toThrow("Unsupported");
});
it("limits PNG dimensions and rejects incomplete or animated images before decoding", () => {
  expect(pngDimensions(png)).toEqual({ width: 1448, height: 1086 });
  const huge = png.slice(); new DataView(huge.buffer).setUint32(16, 8000); expect(() => pngDimensions(huge)).toThrow("2048");
  expect(() => pngDimensions(png.subarray(0, png.length - 1))).toThrow();
  const animated = png.slice(); new DataView(animated.buffer).setUint32(37, 0x6163544c); expect(() => pngDimensions(animated)).toThrow("Animated");
});
it("keeps valid portions usable when referenced artwork or sound is missing or invalid", async () => {
  const record = await parseSkinPack(pack({ sprites: { tap: { file: "missing.png", ...atlas.sprites.tap } }, sounds: { tap: "bad.wav", release: "absent.wav" } }, { "bad.wav": new Uint8Array([1, 2, 3]) }));
  const assets = await loadSkinAssets(record); expect(assets.sprites).toEqual({}); expect(assets.sounds).toEqual({}); expect(assets.warnings).toHaveLength(3);
});
it("rejects empty and out-of-image sprites while retaining valid frames", async () => {
  vi.stubGlobal("Image", class { naturalWidth = 1448; naturalHeight = 1086; decode = async () => {}; });
  let visible = true;
  vi.stubGlobal("document", { createElement: () => ({ getContext: () => ({ drawImage() {}, getImageData: () => ({ data: new Uint8ClampedArray(300 * 300 * 4).fill(visible ? 255 : 0) }) }) }) });
  const record = await parseSkinPack(pack({ sprites: { tap: { file: "art.png", ...atlas.sprites.tap }, holdHead: { file: "art.png", ...atlas.sprites.holdHead, x: 1400 } } }, { "art.png": png }));
  const assets = await loadSkinAssets(record); expect(assets.sprites.tap).toBeDefined(); expect(assets.sprites.holdHead).toBeUndefined(); expect(assets.warnings).toHaveLength(1);
  visible = false; expect((await loadSkinAssets(record)).sprites).toEqual({});
});
