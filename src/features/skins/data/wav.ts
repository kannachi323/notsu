import type { Tone } from "../domain/types";
export type PcmSound = { sampleRate: number; channels: Float32Array[] };

/** Small uncompressed PCM files avoid codec differences and decompression bombs. */
export function readWav(bytes: Uint8Array): PcmSound {
  const fail = (): never => { throw new Error("Use a PCM WAV hit sound, 1 second or less, mono/stereo, 16 or 24 bit, 8–96 kHz."); };
  if (bytes.length < 44 || bytes.length > 400 * 1024) fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (p: number) => String.fromCharCode(...bytes.subarray(p, p + 4));
  if (tag(0) !== "RIFF" || tag(8) !== "WAVE" || view.getUint32(4, true) + 8 !== bytes.length) fail();
  let format: { channels: number; rate: number; bits: number; align: number } | undefined;
  let data: Uint8Array | undefined;
  let p = 12;
  for (; p + 8 <= bytes.length;) {
    const size = view.getUint32(p + 4, true), start = p + 8, next = start + size + (size & 1);
    if (next > bytes.length) fail();
    if (tag(p) === "fmt ") {
      if (format || size < 16 || view.getUint16(start, true) !== 1) fail();
      format = { channels: view.getUint16(start + 2, true), rate: view.getUint32(start + 4, true),
        align: view.getUint16(start + 12, true), bits: view.getUint16(start + 14, true) };
      if (![1, 2].includes(format.channels) || ![16, 24].includes(format.bits) || format.rate < 8000 || format.rate > 96000 ||
          format.align !== format.channels * format.bits / 8 || view.getUint32(start + 8, true) !== format.rate * format.align) fail();
    } else if (tag(p) === "data") { if (data) fail(); data = bytes.subarray(start, start + size); }
    p = next;
  }
  if (p !== bytes.length || !format || !data || !data.length || data.length % format.align || data.length / format.align > format.rate) return fail();
  const frames = data.length / format.align, channels = Array.from({ length: format.channels }, () => new Float32Array(frames));
  const pcm = new DataView(data.buffer, data.byteOffset, data.byteLength); let peak = 0;
  for (let i = 0; i < frames; i++) for (let c = 0; c < format.channels; c++) {
    const offset = i * format.align + c * format.bits / 8;
    const sample = format.bits === 16 ? pcm.getInt16(offset, true) / 32768 : ((pcm.getUint8(offset) | pcm.getUint8(offset + 1) << 8 | pcm.getInt8(offset + 2) << 16) / 8388608);
    channels[c][i] = sample; peak = Math.max(peak, Math.abs(sample));
  }
  if (peak < .0001) throw new Error("This hit sound is silent; using the base sound.");
  const gain = Math.min(4, .25 / peak);
  for (const channel of channels) for (let i = 0; i < channel.length; i++) channel[i] *= gain;
  return { sampleRate: format.rate, channels };
}

export function toneWav(tone: Tone): Uint8Array {
  const rate = 48000, frames = Math.ceil((tone.duration + .006) * rate), bytes = new Uint8Array(44 + frames * 2), view = new DataView(bytes.buffer);
  const text = (p: number, s: string) => { for (let i = 0; i < s.length; i++) bytes[p + i] = s.charCodeAt(i); };
  text(0, "RIFF"); view.setUint32(4, bytes.length - 8, true); text(8, "WAVE"); text(12, "fmt "); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true); view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, "data"); view.setUint32(40, frames * 2, true);
  const k = Math.log(tone.endFrequency / tone.frequency) / tone.duration;
  for (let i = 0; i < frames; i++) {
    const t = i / rate, phase = 2 * Math.PI * tone.frequency * (k === 0 ? t : Math.expm1(k * Math.min(t, tone.duration)) / k);
    const envelope = t < .003 ? tone.gain * t / .003 : t < tone.duration ? tone.gain * (.0001 / tone.gain) ** ((t - .003) / (tone.duration - .003)) : .0001 * Math.max(0, 1 - (t - tone.duration) / .005);
    view.setInt16(44 + i * 2, Math.round(Math.sin(phase) * envelope * 32767), true);
  }
  return bytes;
}
