import { afterEach, expect, it, vi } from "vitest";
import { barSprite, sprite } from "./sprites";
import { getSkin } from "./skins";
import { atlasManifest } from "../data/gameplayAtlas";

const image = vi.hoisted(() => ({ value: undefined as HTMLImageElement | undefined }));
vi.mock("../data/gameplayAtlas", async original => ({ ...await original<object>(), gameplayAtlas: () => image.value }));
afterEach(() => { image.value = undefined; });
const context = () => ({ drawImage: vi.fn() });

it("keeps the logical note centre fixed using the measured pivot", () => {
  image.value = {} as HTMLImageElement;
  const ctx = context(); expect(sprite(ctx as unknown as CanvasRenderingContext2D, getSkin("midnight"), "tap", 123, 456, 18)).toBe(true);
  const [, sx, sy, sw, sh, dx, dy, dw, dh] = ctx.drawImage.mock.calls[0];
  const frame = atlasManifest.sprites.tap;
  expect([sx, sy, sw, sh]).toEqual([frame.x, frame.y, frame.width, frame.height]);
  expect(dx + frame.pivotX / sw * dw).toBeCloseTo(123);
  expect(dy + frame.pivotY / sh * dh).toBeCloseTo(456);
  expect(dw / sw * frame.bodyWidth).toBeCloseTo(18);
});
it("preserves cap aspect ratio while stretching only the middle of a hold", () => {
  image.value = {} as HTMLImageElement;
  const ctx = context(); barSprite(ctx as unknown as CanvasRenderingContext2D, getSkin("midnight"), "ribbon", 50, 400, 7);
  const [left, middle, right] = ctx.drawImage.mock.calls;
  expect(left[5] + left[7]).toBeCloseTo(50); expect(right[5]).toBe(400);
  expect(middle[5]).toBe(50); expect(middle[7]).toBe(350);
  for (const cap of [left, right]) expect(cap[7] / cap[3]).toBeCloseTo(cap[8] / cap[4]);
});
it("uses primitive fallbacks if art is missing or the high-contrast skin is selected", () => {
  const ctx = context();
  expect(sprite(ctx as unknown as CanvasRenderingContext2D, getSkin("midnight"), "tap", 0, 0, 18)).toBe(false);
  image.value = {} as HTMLImageElement;
  expect(sprite(ctx as unknown as CanvasRenderingContext2D, getSkin("high-contrast"), "tap", 0, 0, 18)).toBe(false);
  expect(ctx.drawImage).not.toHaveBeenCalled();
});
it("draws imported art with the same logical diameter and falls back per sprite", async () => {
  const { cacheSkinAssets, forgetSkin } = await import("../../skins/data/registry");
  const id = "skin:" + "e".repeat(64), customImage = { custom: true } as unknown as HTMLImageElement;
  image.value = {} as HTMLImageElement;
  const frame = { x: 0, y: 0, width: 100, height: 100, pivotX: 50, pivotY: 50, bodyWidth: 100, bodyHeight: 100 };
  cacheSkinAssets(id, { sprites: { tap: { image: customImage, frame } }, sounds: {}, warnings: [] });
  try {
    const skin = { ...getSkin("midnight"), id }, ctx = context();
    sprite(ctx as unknown as CanvasRenderingContext2D, skin, "tap", 10, 20, 18);
    expect(ctx.drawImage).toHaveBeenCalledWith(customImage, 0, 0, 100, 100, 1, 11, 18, 18);
    sprite(ctx as unknown as CanvasRenderingContext2D, skin, "holdHead", 10, 20, 18);
    expect(ctx.drawImage.mock.lastCall?.[0]).toBe(image.value);
  } finally { forgetSkin(id); }
});
