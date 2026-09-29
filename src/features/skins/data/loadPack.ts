import { validateManifest } from "../domain/manifest";
import type { SpriteName, SoundName } from "../domain/manifest";
import { archiveJob } from "./archiveClient";
import { MAX_ARCHIVE_BYTES } from "./archive";
import { readWav } from "./wav";
import type { SkinRecord, SkinAssets } from "./registry";

export async function parseSkinPack(archive: Uint8Array): Promise<SkinRecord> {
  if (archive.byteLength > MAX_ARCHIVE_BYTES) throw new Error("Choose a skin pack smaller than 16 MB.");
  const files = await archiveJob<Record<string, Uint8Array>>({ action: "unpack", bytes: archive });
  const parsed = validateManifest(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(files["skin.json"])));
  const hash = await crypto.subtle.digest("SHA-256", new Uint8Array(archive));
  const id = "skin:" + [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return { id, archive, ...parsed };
}

export function pngDimensions(bytes: Uint8Array): { width: number; height: number } {
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (bytes.length < 33 || signature.some((v, i) => bytes[i] !== v)) throw new Error("Artwork is not a PNG.");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(8) !== 13 || view.getUint32(12) !== 0x49484452) throw new Error("Invalid PNG header.");
  const width = view.getUint32(16), height = view.getUint32(20);
  if (!width || !height || width > 2048 || height > 2048) throw new Error("PNG artwork must fit within 2048×2048 pixels.");
  let ended = false;
  for (let p = 8; p + 12 <= bytes.length;) {
    const size = view.getUint32(p); if (p + 12 + size > bytes.length) throw new Error("Truncated PNG.");
    if (view.getUint32(p + 4) === 0x6163544c) throw new Error("Animated PNG files are not supported; gameplay controls effect animations.");
    const kind = view.getUint32(p + 4);
    p += 12 + size;
    if (kind === 0x49454e44) {
      if (size !== 0 || p !== bytes.length) throw new Error("Invalid PNG ending.");
      ended = true; break;
    }
  }
  if (!ended) throw new Error("Missing PNG ending.");
  return { width, height };
}
async function decodePng(bytes: Uint8Array): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/png" }));
  const image = new Image(); image.src = url;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([image.decode(), new Promise<never>((_, reject) => {
      timeout = setTimeout(() => { image.src = ""; reject(new Error("Image decoding timed out.")); }, 8000);
    })]);
    return image;
  } finally { clearTimeout(timeout); URL.revokeObjectURL(url); }
}

export async function loadSkinAssets(record: SkinRecord): Promise<SkinAssets> {
  const files = await archiveJob<Record<string, Uint8Array>>({ action: "unpack", bytes: record.archive });
  const { manifest, warnings } = validateManifest(JSON.parse(new TextDecoder().decode(files["skin.json"])));
  const result: SkinAssets = { sprites: {}, sounds: {}, warnings: [...record.warnings, ...warnings] };
  const images = new Map<string, HTMLImageElement>(); let pixels = 0;
  for (const file of new Set(Object.values(manifest.sprites).map(frame => frame!.file))) {
    try {
      if (!files[file]) throw new Error("File is missing.");
      const size = pngDimensions(files[file]); pixels += size.width * size.height;
      if (pixels > 8 * 1024 * 1024) throw new Error("Skin image memory budget exceeded.");
      const image = await decodePng(files[file]);
      if (image.naturalWidth !== size.width || image.naturalHeight !== size.height) throw new Error("Decoded image dimensions differ.");
      images.set(file, image);
    } catch (cause) { result.warnings.push(`${file}: ${cause instanceof Error ? cause.message : "Could not decode artwork."} Using base artwork.`); }
  }
  for (const [name, frame] of Object.entries(manifest.sprites)) {
    const image = images.get(frame.file); if (!image) continue;
    try {
      if (frame.x + frame.width > image.naturalWidth || frame.y + frame.height > image.naturalHeight) throw new Error("Frame is outside the image.");
      const canvas = document.createElement("canvas"); canvas.width = frame.width; canvas.height = frame.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      ctx.drawImage(image, frame.x, frame.y, frame.width, frame.height, 0, 0, frame.width, frame.height);
      const rgba = ctx.getImageData(0, 0, frame.width, frame.height).data; let visible = 0;
      for (let i = 3; i < rgba.length; i += 4) if (rgba[i] >= 32) visible++;
      if (visible < frame.width * frame.height * .015) throw new Error("Sprite is empty or nearly transparent.");
      result.sprites[name as SpriteName] = { image, frame };
    } catch (cause) { result.warnings.push(`${name}: ${cause instanceof Error ? cause.message : "Invalid frame."} Using the base sprite.`); }
  }
  for (const [name, file] of Object.entries(manifest.sounds)) {
    try {
      if (!files[file]) throw new Error("File is missing.");
      result.sounds[name as SoundName] = readWav(files[file]);
    } catch (cause) { result.warnings.push(`${file}: ${cause instanceof Error ? cause.message : "Invalid sound."} Using the base sound.`); }
  }
  result.warnings = [...new Set(result.warnings)]; return result;
}
