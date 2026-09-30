import url from "../assets/gameplay-atlas-v1.png";
import manifest from "../assets/gameplay-atlas-v1.json";

export const atlasManifest = manifest;
export type SpriteName = keyof typeof manifest.sprites;
let loaded: HTMLImageElement | undefined;
let pending: Promise<void> | undefined;

/** Decode once before starting audio; missing or corrupt art keeps vector fallbacks. */
export function loadGameplayAtlas(): Promise<void> {
  return pending ??= (async () => {
    try {
      const image = new Image(); image.src = url; await image.decode();
      if (image.naturalWidth === manifest.imageWidth && image.naturalHeight === manifest.imageHeight) loaded = image;
    } catch { /* Built-in Canvas primitives remain readable without this texture. */ }
  })();
}

export function gameplayAtlas(): HTMLImageElement | undefined { return loaded; }
