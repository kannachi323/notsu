import { afterEach, expect, it, vi } from "vitest";
import { decodeSong, importSong, peakRange, probeDuration, songHash, songMime, waveform } from "./song";
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
const buffer = { duration: 1, length: 8, numberOfChannels: 2, getChannelData: (index: number) => new Float32Array(index ? [-.8, 0, 0, .2, 0, 0, 0, 0] : [.8, 0, 0, -.2, 0, 0, 0, 0]) } as AudioBuffer;
it("keeps stereo transients instead of cancelling opposite-phase channels", async () => {
  expect(peakRange([buffer.getChannelData(0), buffer.getChannelData(1)], 0, 8)).toBeCloseTo(.8);
  const peaks = await waveform(buffer); expect(Math.max(...peaks)).toBeCloseTo(.8); expect(peaks.length).toBe(40);
});
it("validates supported filenames and size before reading or decoding files", async () => {
  expect(songMime("Song.MP3")).toBe("audio/mpeg"); expect(songMime("song.wav")).toBe("audio/wav");
  expect(() => songMime("song.mp3.exe")).toThrow("MP3 or WAV");
  const read = vi.fn(); await expect(importSong({ name: "song.wav", size: 101 * 1024 * 1024, arrayBuffer: read } as unknown as File, {} as AudioContext)).rejects.toThrow("100 MB");
  expect(read).not.toHaveBeenCalled();
});
it("binds the original bytes and checks saved song identity before decoding", async () => {
  const bytes = new Uint8Array([1, 2, 3]).buffer, decodeAudioData = vi.fn(async (_input: ArrayBuffer) => buffer);
  const context = { decodeAudioData } as unknown as AudioContext;
  await expect(decodeSong(bytes, "song.wav", context, "a".repeat(64))).rejects.toThrow("changed"); expect(decodeAudioData).not.toHaveBeenCalled();
  const result = await decodeSong(bytes, "song.wav", context);
  expect(result.reference.sha256).toBe(await songHash(bytes)); expect(result.bytes).toBe(bytes);
  expect(decodeAudioData.mock.calls[0][0]).not.toBe(bytes);
});
it("rejects failed decoding, excessive duration, channel count and decoded memory", async () => {
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  await expect(decodeSong(bytes, "song.wav", { decodeAudioData: async () => { throw new Error(); } } as unknown as AudioContext)).rejects.toThrow("decoded");
  for (const extra of [{ duration: 0 }, { duration: 1801 }, { numberOfChannels: 6 }, { length: 100_000_000 }]) {
    await expect(decodeSong(bytes, "song.wav", { decodeAudioData: async () => ({ ...buffer, ...extra }) } as unknown as AudioContext)).rejects.toThrow("mono or stereo");
  }
});
it("checks metadata duration before allocating PCM and releases the temporary media URL", async () => {
  const cleanup = vi.fn(), revoke = vi.spyOn(URL, "revokeObjectURL");
  class Media {
    duration = 2000; onloadedmetadata: (() => void) | null = null; onerror = null;
    set src(_value: string) { queueMicrotask(() => this.onloadedmetadata?.()); }
    removeAttribute = cleanup; load = cleanup;
  }
  vi.stubGlobal("Audio", Media); const decodeAudioData = vi.fn();
  await expect(decodeSong(new Uint8Array([1, 2, 3]).buffer, "long.wav", { decodeAudioData } as unknown as AudioContext)).rejects.toThrow("30 minutes");
  expect(decodeAudioData).not.toHaveBeenCalled(); expect(cleanup).toHaveBeenCalledTimes(2); expect(revoke).toHaveBeenCalledOnce();
});
it("bounds metadata waits so an undecodable recording cannot leave import busy forever", async () => {
  vi.useFakeTimers(); const release = vi.spyOn(URL, "revokeObjectURL");
  vi.stubGlobal("Audio", class { onloadedmetadata = null; onerror = null; removeAttribute() {} load() {} });
  const pending = expect(probeDuration(new ArrayBuffer(3), "audio/wav")).rejects.toThrow("too long");
  await vi.advanceTimersByTimeAsync(10000); await pending; expect(release).toHaveBeenCalledOnce();
});
