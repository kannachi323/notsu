import { builtinSkins } from "../domain/builtins";
import type { Skin } from "../domain/types";
import type { SkinManifest, SoundName, SpriteFrame, SpriteName } from "../domain/manifest";
import type { PcmSound } from "./wav";

export type SkinRecord = { id: string; manifest: SkinManifest; archive: Uint8Array; warnings: string[] };
export type SkinAssets = { sprites: Partial<Record<SpriteName, { image: HTMLImageElement; frame: SpriteFrame }>>; sounds: Partial<Record<SoundName, PcmSound>>; warnings: string[] };
const definitions = new Map<string, Skin>();
const assets = new Map<string, SkinAssets>();
export const getSkin = (id: unknown): Skin => typeof id === "string" ? definitions.get(id) ?? builtinSkins.find(skin => skin.id === id) ?? builtinSkins[0] : builtinSkins[0];
export function registerSkin(skin: Skin) { definitions.set(skin.id, skin); }
export function forgetSkin(id: string) { definitions.delete(id); assets.delete(id); }
export function skinAssets(id: string) { return assets.get(id); }
export function cacheSkinAssets(id: string, value: SkinAssets) {
  assets.delete(id); assets.set(id, value);
  while (assets.size > 2) assets.delete(assets.keys().next().value!);
}
