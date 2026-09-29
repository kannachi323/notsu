import { expect, it } from "vitest";
import { builtinSkins } from "../domain/builtins";
import { readWav, toneWav } from "./wav";
const tone = builtinSkins[0].sounds.tap;
it("exports original synthesized taps/releases as bounded normalized PCM", () => {
  for (const sound of Object.values(builtinSkins[0].sounds)) {
    const pcm = readWav(toneWav(sound));
    expect(pcm.sampleRate).toBe(48000); expect(pcm.channels).toHaveLength(1);
    expect(pcm.channels[0].length / pcm.sampleRate).toBeLessThan(1);
    expect(Math.max(...pcm.channels[0].map(Math.abs))).toBeCloseTo(.25);
  }
});
it("rejects compressed, silent, overlong, misaligned and truncated WAV files", () => {
  for (const mutate of [
    (v: DataView) => v.setUint16(20, 3, true),
    (v: DataView) => v.setUint16(32, 9, true),
    (v: DataView) => v.setUint32(24, 192000, true),
    (v: DataView) => v.setUint32(40, 999999, true),
  ]) { const bytes = toneWav(tone); mutate(new DataView(bytes.buffer)); expect(() => readWav(bytes)).toThrow(); }
  const silent = toneWav(tone); silent.fill(0, 44); expect(() => readWav(silent)).toThrow("silent");
  expect(() => readWav(toneWav({ ...tone, duration: 1.01 }))).toThrow();
  const bytes = toneWav(tone); expect(() => readWav(bytes.subarray(0, bytes.length - 1))).toThrow();
});
it("rejects trailing fragments even with a matching RIFF length", () => {
  const source = toneWav(tone), bytes = new Uint8Array(source.length + 3); bytes.set(source);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true); expect(() => readWav(bytes)).toThrow();
});
it("decodes signed 24-bit stereo channels independently", () => {
  const bytes = new Uint8Array(44 + 12); bytes.set(toneWav(tone).subarray(0, 44));
  const v = new DataView(bytes.buffer); v.setUint32(4, bytes.length - 8, true); v.setUint16(22, 2, true);
  v.setUint32(28, 48000 * 6, true); v.setUint16(32, 6, true); v.setUint16(34, 24, true); v.setUint32(40, 12, true);
  bytes.set([0, 0, 64, 0, 0, 192, 0, 0, 32, 0, 0, 224], 44);
  const { channels } = readWav(bytes);
  expect([...channels[0]]).toEqual([.25, .125]); expect([...channels[1]]).toEqual([-.25, -.125]);
});
