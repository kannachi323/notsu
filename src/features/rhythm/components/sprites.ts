import { atlasManifest, gameplayAtlas } from "../data/gameplayAtlas";
import type { SpriteName } from "../data/gameplayAtlas";
import type { Skin } from "./skins";
import { skinAssets } from "../../skins/data/registry";

function resolve(skin: Skin, name: SpriteName) {
  const custom = skinAssets(skin.id)?.sprites[name];
  if (custom) return custom;
  const image = skin.atlas === "gloss-v1" ? gameplayAtlas() : undefined;
  return image ? { image, frame: atlasManifest.sprites[name] } : undefined;
}

/** Measured source pivots keep the visible body on the logical timing position. */
export function sprite(ctx: CanvasRenderingContext2D, skin: Skin, name: SpriteName, x: number, y: number, diameter: number): boolean {
  const resolved = resolve(skin, name); if (!resolved) return false;
  const { image, frame } = resolved;
  const scale = diameter / Math.max(frame.bodyWidth, frame.bodyHeight);
  ctx.drawImage(image, frame.x, frame.y, frame.width, frame.height,
    x - frame.pivotX * scale, y - frame.pivotY * scale, frame.width * scale, frame.height * scale);
  return true;
}

/** Three slices stretch the body while keeping each end cap circular. */
export function barSprite(ctx: CanvasRenderingContext2D, skin: Skin, name: "lane" | "ribbon", from: number, to: number, thickness: number): boolean {
  const resolved = resolve(skin, name); if (!resolved || to < from) return false;
  const { image, frame } = resolved, scale = thickness / frame.bodyHeight;
  const left = frame.pivotX - (frame.bodyWidth - frame.bodyHeight) / 2;
  const right = frame.pivotX + (frame.bodyWidth - frame.bodyHeight) / 2;
  const leftWidth = left * scale, rightWidth = (frame.width - right) * scale;
  const top = -frame.pivotY * scale, height = frame.height * scale;
  // The logical endpoints are the cap centres, as with a round Canvas line.
  ctx.drawImage(image, frame.x, frame.y, left, frame.height, from - leftWidth, top, leftWidth, height);
  ctx.drawImage(image, frame.x + left, frame.y, right - left, frame.height, from, top, to - from, height);
  ctx.drawImage(image, frame.x + right, frame.y, frame.width - right, frame.height, to, top, rightWidth, height);
  return true;
}
