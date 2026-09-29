import { expect, it } from "vitest";
import { zipSync } from "fflate";
import { MAX_ARCHIVE_BYTES, packSkin, unpackSkin } from "./archive";
const text = new TextEncoder().encode('{"name":"test"}');
const files = { "skin.json": text, "art.png": new Uint8Array(10000).fill(7) };
function headers(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer); const end = bytes.length - 22, central = view.getUint32(end + 16, true);
  return { view, central };
}
it.each([0, 6, 9] as const)("round trips stored and deflated archives at level %s", level => {
  expect(unpackSkin(zipSync(files, { level }))).toEqual(files);
  expect(unpackSkin(packSkin(files))).toEqual(files);
});
it.each(["../evil.png", "a/../../evil.png", "https://evil.png", "code.js", "Skin.json", "other.json"])("rejects unsupported file %s", name => {
  expect(() => unpackSkin(zipSync({ "skin.json": text, [name]: text }))).toThrow();
});
it("rejects duplicate names differing only in case", () => {
  expect(() => unpackSkin(zipSync({ "skin.json": text, "a.png": text, "A.png": text }))).toThrow("duplicate");
});
it("checks file CRC after decompression", () => {
  const zip = packSkin(files), { view, central } = headers(zip);
  const start = 30 + view.getUint16(26, true); zip[start] ^= 1;
  expect(() => unpackSkin(zip)).toThrow("checksum");
  expect(view.getUint32(central, true)).toBe(0x02014b50);
});
it("limits actual inflated bytes when both headers lie about their size", () => {
  const zip = zipSync({ "skin.json": new Uint8Array(60000).fill(1) }, { level: 9 });
  const { view, central } = headers(zip); view.setUint32(22, 1, true); view.setUint32(central + 24, 1, true);
  expect(() => unpackSkin(zip)).toThrow("declared size");
});
it("rejects sizes exceeding per-file limits before allocating output", () => {
  const zip = zipSync({ "skin.json": text }); const { view, central } = headers(zip);
  view.setUint32(central + 24, 0xffffffff, true);
  expect(() => unpackSkin(zip)).toThrow("oversized");
  expect(() => unpackSkin(new Uint8Array(MAX_ARCHIVE_BYTES + 1))).toThrow("16 MB");
});
it("rejects encryption, mismatched headers, excess files, and truncated data", () => {
  const zip = packSkin(files); const { view, central } = headers(zip);
  view.setUint16(central + 8, 1, true); expect(() => unpackSkin(zip)).toThrow();
  const mismatch = packSkin(files); mismatch[30] = 65; expect(() => unpackSkin(mismatch)).toThrow();
  expect(() => unpackSkin(packSkin(files).subarray(0, 70))).toThrow();
  expect(() => unpackSkin(zipSync({ "skin.json": text, ...Object.fromEntries(Array.from({ length: 32 }, (_, i) => [`${i}.png`, text])) }))).toThrow();
});
it("enforces a combined expanded budget even for tiny highly compressed inputs", () => {
  const big = new Uint8Array(8 * 1024 * 1024);
  expect(() => unpackSkin(zipSync({ "skin.json": text, "a.png": big, "b.png": big, "c.png": big }, { level: 6 }))).toThrow("24 MB");
});
