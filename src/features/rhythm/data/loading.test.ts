import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RhythmAudio } from "./audio";
import { songChart } from "./charts";

const decode = vi.fn();
beforeEach(() => {
  decode.mockReset().mockResolvedValue({ duration: 88 });
  vi.stubGlobal("AudioContext", class {
    destination = {};
    createGain() { return { connect() {} }; }
    decodeAudioData = decode;
  });
});
afterEach(() => vi.unstubAllGlobals());

describe("local audio validation", () => {
  it("rejects a different recording before decoding", async () => {
    await expect(new RhythmAudio().load(new File(["not the recording"], "audio.mp3"), songChart)).rejects.toThrow("88-second");
    expect(decode).not.toHaveBeenCalled();
  });
  it("rejects oversized files before reading", async () => {
    const file = { size: 31 * 1024 * 1024, arrayBuffer: vi.fn() };
    await expect(new RhythmAudio().load(file as unknown as File, songChart)).rejects.toThrow("30 MB");
    expect(file.arrayBuffer).not.toHaveBeenCalled();
  });
  it("explains decoding failures", async () => {
    decode.mockRejectedValue(new Error("decode failed"));
    await expect(new RhythmAudio().load(new File(["invalid"], "bad.mp3"), { ...songChart, audioSha256: undefined })).rejects.toThrow("could not be decoded");
  });
  it("rejects a recording shorter than the excerpt", async () => {
    decode.mockResolvedValue({duration: 30});
    await expect(new RhythmAudio().load(new File(["test"], "short.mp3"), { ...songChart, audioSha256: undefined })).rejects.toThrow("shorter");
  });
});
