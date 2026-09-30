import { expect, it } from "vitest";
import { applyManifest, isSkinId, packPath, validateManifest } from "./manifest";
import { builtinSkins } from "./builtins";
import atlas from "../../rhythm/assets/gameplay-atlas-v1.json";

const raw = () => ({ format: "notsu-skin", version: 1, name: "My skin", author: "Player", base: "midnight" });
it("accepts all production frames and both default accessible themes without fallback", () => {
  for (const skin of builtinSkins) {
    const result = validateManifest({ ...raw(), base: skin.id, theme: skin.ui,
      sprites: Object.fromEntries(Object.entries(atlas.sprites).map(([name, frame]) => [name, { file: "atlas.png", ...frame }])) });
    expect(result.warnings).toEqual([]); expect(Object.keys(result.manifest.sprites)).toHaveLength(12);
  }
});
it.each(["hitWindow", "score", "script", "css", "__proto__"])("rejects unsupported field %s", key => {
  expect(() => validateManifest({ ...raw(), [key]: "anything" })).toThrow("Unsupported skin field");
});
it.each(["../asset.png", "/asset.png", "https://host/art.png", "a//b.png", "a/../b.png", "a\\b.png", "./skin.json"])("rejects unsafe path %s", path => {
  expect(() => packPath(path)).toThrow();
});
it("preserves game metrics while applying appearance-only fields", () => {
  const { manifest } = validateManifest({ ...raw(), gameplay: { tap: "#ffffff", lane: "#ffffff" } });
  const skin = applyManifest("skin:" + "a".repeat(64), manifest), base = builtinSkins[0];
  expect(skin.note).toEqual({ ...base.note, tap: "#ffffff" });
  expect(skin.lane).toEqual({ ...base.lane, color: "#ffffff" });
  expect(skin.target).toEqual(base.target); expect(skin.effects).toEqual(base.effects);
  expect(isSkinId(skin.id)).toBe(true); expect(isSkinId("skin:midnight")).toBe(false);
});
it("falls back for colors that could hide interface text or inject CSS", () => {
  const low = validateManifest({ ...raw(), theme: { text: "#10141e" } });
  expect(low.manifest.theme).toEqual({}); expect(low.warnings).toHaveLength(1);
  const css = validateManifest({ ...raw(), theme: { accent: "url(https://evil.test)" } });
  expect(css.manifest.theme).toEqual({}); expect(css.warnings).toHaveLength(1);
});
it.each([{ pivotX: -1 }, { bodyWidth: 0 }, { width: 4096 }, { pivotY: 999 }, { bodyHeight: 1 }, { width: 1.5 }])("falls back for malformed geometry %j", change => {
  const result = validateManifest({ ...raw(), sprites: { tap: { file: "art.png", ...atlas.sprites.tap, ...change } } });
  expect(result.manifest.sprites).toEqual({}); expect(result.warnings).toHaveLength(1);
});
it("rejects hidden rule changes in nested objects and unsupported media", () => {
  expect(() => validateManifest({ ...raw(), gameplay: { radius: 100 } })).toThrow();
  expect(() => validateManifest({ ...raw(), sprites: { tap: { file: "art.svg" } } })).toThrow();
  expect(() => validateManifest({ ...raw(), sounds: { tap: "remote.mp3" } })).toThrow();
});
