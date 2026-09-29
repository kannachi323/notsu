import atlasUrl from "../../rhythm/assets/gameplay-atlas-v1.png";
import atlas from "../../rhythm/assets/gameplay-atlas-v1.json";
import { builtinSkins } from "../domain/builtins";
import { archiveJob } from "./archiveClient";
import { toneWav } from "./wav";

export async function starterSkin(): Promise<Uint8Array> {
  const base = builtinSkins[0];
  const response = await fetch(atlasUrl); if (!response.ok) throw new Error("The built-in artwork could not be loaded.");
  const manifest = { format: "notsu-skin", version: 1, name: "My first skin", author: "Your name", base: "midnight",
    theme: base.ui, gameplay: {}, sprites: Object.fromEntries(Object.entries(atlas.sprites).map(([name, frame]) => [name, { file: "atlas.png", ...frame }])),
    sounds: { tap: "tap.wav", release: "release.wav" } };
  return archiveJob<Uint8Array>({ action: "pack", files: { "skin.json": new TextEncoder().encode(JSON.stringify(manifest, null, 2)),
    "atlas.png": new Uint8Array(await response.arrayBuffer()), "tap.wav": toneWav(base.sounds.tap), "release.wav": toneWav(base.sounds.release) } });
}
