import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { packSkin, unpackSkin } from "./archive";
import { starterSkin } from "./exportPack";
import { validateManifest } from "../domain/manifest";
import { readWav } from "./wav";
vi.mock("./archiveClient", () => ({ archiveJob: async ({ files }: { files: Record<string, Uint8Array> }) => packSkin(files) }));
afterEach(() => vi.unstubAllGlobals());
it("exports a complete editable starter with all sprites and both sounds", async () => {
  const png = readFileSync(new URL("../../rhythm/assets/gameplay-atlas-v1.png", import.meta.url));
  vi.stubGlobal("fetch", vi.fn(async () => new Response(png)));
  const files = unpackSkin(await starterSkin());
  const { manifest, warnings } = validateManifest(JSON.parse(new TextDecoder().decode(files["skin.json"])));
  expect(warnings).toEqual([]); expect(Object.keys(manifest.sprites)).toHaveLength(12);
  expect(files["atlas.png"]).toEqual(new Uint8Array(png));
  for (const file of Object.values(manifest.sounds)) expect(readWav(files[file!]).channels).toHaveLength(1);
});
it("surfaces an unavailable bundled atlas instead of creating a broken starter", async () => {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
  await expect(starterSkin()).rejects.toThrow("could not be loaded");
});
