import type { Skin } from "./types";
import { builtinSkins } from "./builtins";

export const spriteNames = ["tap", "holdHead", "holdTail", "miss", "target", "targetTap", "targetHold", "warning", "lane", "ribbon", "hitTap", "hitHold"] as const;
export type SpriteName = typeof spriteNames[number];
export type SoundName = "tap" | "release";
export type SpriteFrame = { x: number; y: number; width: number; height: number; pivotX: number; pivotY: number; bodyWidth: number; bodyHeight: number };
export type SpriteReference = SpriteFrame & { file: string };
export type GameplayColors = Partial<Record<"tap" | "hold" | "lane" | "target" | "highlight" | "shade" | "warning", string>>;
export type SkinManifest = {
  format: "notsu-skin"; version: 1; name: string; author: string; base: "midnight" | "high-contrast";
  theme: Partial<Skin["ui"]>; gameplay: GameplayColors;
  sprites: Partial<Record<SpriteName, SpriteReference>>; sounds: Partial<Record<SoundName, string>>;
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected a skin object.");
  return value as Record<string, unknown>;
};
const allowed = (value: Record<string, unknown>, keys: readonly string[]) => {
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`Unsupported skin field: ${key}`);
};
const label = (value: unknown, field: string) => {
  if (typeof value !== "string" || !value.trim() || value.length > 80 || /[\x00-\x1f\x7f]/.test(value)) throw new Error(`Invalid skin ${field}.`);
  return value.trim();
};
export const isSkinId = (value: unknown): value is string => typeof value === "string" && /^(midnight|high-contrast|skin:[a-f0-9]{64})$/.test(value);
export function packPath(value: unknown): string {
  if (typeof value !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9_./-]{0,119}$/.test(value) || value.split("/").some(part => !part || part === "." || part === "..")) {
    throw new Error("Skin file paths must be relative, with no traversal or URLs.");
  }
  return value;
}
const luminance = (hex: string) => {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return .2126 * rgb[0] + .7152 * rgb[1] + .0722 * rgb[2];
};
export function contrast(a: string, b: string) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); }

export function validateManifest(value: unknown): { manifest: SkinManifest; warnings: string[] } {
  const raw = object(value), warnings: string[] = [];
  allowed(raw, ["format", "version", "name", "author", "base", "theme", "gameplay", "sprites", "sounds"]);
  if (raw.format !== "notsu-skin" || raw.version !== 1 || (raw.base !== "midnight" && raw.base !== "high-contrast")) throw new Error("Unsupported skin format, version or base.");
  const base = builtinSkins.find(skin => skin.id === raw.base)!;
  const colors = (input: unknown, keys: string[], group: string): Record<string, string> => {
    const source = object(input ?? {}), result: Record<string, string> = {}; allowed(source, keys);
    for (const [key, color] of Object.entries(source)) {
      if (typeof color === "string" && (key === "overlay" ? /^#[a-f\d]{6}([a-f\d]{2})?$/i : /^#[a-f\d]{6}$/i).test(color)) result[key] = color;
      else warnings.push(`${group}.${key}: invalid color; using the base skin.`);
    }
    return result;
  };
  let theme = colors(raw.theme, Object.keys(base.ui), "theme");
  const palette = { ...base.ui, ...theme };
  if ([palette.background, palette.surface].some(bg => contrast(bg, palette.text) < 4.5 || contrast(bg, palette.muted) < 4.5) ||
      contrast(palette.accent, palette["on-accent"]) < 4.5 || contrast(palette.focus, palette.background) < 3) {
    theme = {}; warnings.push("Theme text or focus contrast is too low; using the base theme.");
  }
  const gameplay = colors(raw.gameplay, ["tap", "hold", "lane", "target", "highlight", "shade", "warning"], "gameplay");
  const sprites: SkinManifest["sprites"] = {}, sounds: SkinManifest["sounds"] = {};
  const images = object(raw.sprites ?? {}); allowed(images, spriteNames);
  for (const [name, value] of Object.entries(images)) {
    const frame = object(value); allowed(frame, ["file", "x", "y", "width", "height", "pivotX", "pivotY", "bodyWidth", "bodyHeight"]);
    const file = packPath(frame.file);
    if (!file.endsWith(".png")) throw new Error("Skin artwork must use PNG files.");
    const ref = frame as unknown as SpriteReference;
    const numbers = [ref.x, ref.y, ref.width, ref.height, ref.pivotX, ref.pivotY, ref.bodyWidth, ref.bodyHeight];
    const rect = [ref.x, ref.y, ref.width, ref.height, ref.bodyWidth, ref.bodyHeight];
    const bar = name === "lane" || name === "ribbon";
    if (numbers.some(v => !Number.isFinite(v) || v < 0 || v > 2048) || rect.some(v => !Number.isInteger(v)) ||
        ref.width < 4 || ref.height < 4 || ref.bodyWidth < .85 * ref.width || ref.bodyHeight < .75 * ref.height ||
        ref.pivotX < ref.bodyWidth / 2 || ref.pivotX + ref.bodyWidth / 2 > ref.width ||
        ref.pivotY < ref.bodyHeight / 2 || ref.pivotY + ref.bodyHeight / 2 > ref.height ||
        (bar ? ref.bodyWidth <= ref.bodyHeight : Math.abs(ref.bodyWidth / ref.bodyHeight - 1) > .1)) {
      warnings.push(`${name}: invalid bounds or pivot; using the base sprite.`); continue;
    }
    sprites[name as SpriteName] = { file, x: ref.x, y: ref.y, width: ref.width, height: ref.height,
      pivotX: ref.pivotX, pivotY: ref.pivotY, bodyWidth: ref.bodyWidth, bodyHeight: ref.bodyHeight };
  }
  const audio = object(raw.sounds ?? {}); allowed(audio, ["tap", "release"]);
  for (const [name, value] of Object.entries(audio)) {
    const file = packPath(value); if (!file.endsWith(".wav")) throw new Error("Skin hit sounds must use PCM WAV files.");
    sounds[name as SoundName] = file;
  }
  return { warnings, manifest: { format: "notsu-skin", version: 1, name: label(raw.name, "name"), author: label(raw.author, "author"),
    base: raw.base, theme, gameplay, sprites, sounds } };
}

export function applyManifest(id: string, manifest: SkinManifest): Skin {
  const base = builtinSkins.find(skin => skin.id === manifest.base)!;
  const c = manifest.gameplay;
  return { ...base, id, name: manifest.name, ui: { ...base.ui, ...manifest.theme },
    note: { ...base.note, ...Object.fromEntries(Object.entries(c).filter(([key]) => ["tap", "hold", "highlight", "shade"].includes(key))) },
    lane: { ...base.lane, color: c.lane ?? base.lane.color }, target: { ...base.target, color: c.target ?? base.target.color },
    effects: { ...base.effects, warning: c.warning ?? base.effects.warning } };
}
