import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { RhythmAudio } from "./audio";
import { songChart } from "./charts";

const source = () => ({ start: vi.fn(), stop: vi.fn(), connect: vi.fn(), disconnect: vi.fn(), buffer: null });
const context = { currentTime: 10, state: "running", destination: {}, baseLatency: 0, outputLatency: 0,
  createGain: () => ({ connect: vi.fn(), gain: { value: 0 } }), createBufferSource: vi.fn(source), resume: vi.fn(async () => {}) };
const buffer = {} as AudioBuffer;
beforeEach(() => {
  context.currentTime = 10; context.state = "running"; context.createBufferSource.mockClear();
  context.resume.mockReset().mockResolvedValue();
  vi.stubGlobal("AudioContext", class { constructor() { return context; } });
});
afterEach(() => vi.unstubAllGlobals());

it("resumes from the exact audio offset with a silent three-second count-in", async () => {
  const audio = new RhythmAudio();
  expect(await audio.start(buffer, songChart, .5, 12345, 3000)).toBe(true);
  const node = context.createBufferSource.mock.results[0].value;
  expect(node.start).toHaveBeenCalledWith(13, (songChart.audioOffsetMs + 12345) / 1000, (songChart.durationMs - 12345) / 1000);
  expect(audio.timeAt()).toBeCloseTo(9345, 0);
  context.currentTime = 13;
  expect(audio.timeAt()).toBeCloseTo(12345, 0);
  audio.stop(); expect(node.stop).toHaveBeenCalledOnce(); expect(node.disconnect).toHaveBeenCalledOnce();
});
it("preserves negative countdown positions and handles a silent calibrated tail", async () => {
  const audio = new RhythmAudio();
  await audio.start(buffer, songChart, .5, -500, 3000);
  expect(context.createBufferSource.mock.results[0].value.start).toHaveBeenCalledWith(13.5, songChart.audioOffsetMs / 1000, songChart.durationMs / 1000);
  context.currentTime = 13; expect(audio.timeAt()).toBeCloseTo(-500, 0);
  await audio.start(buffer, songChart, .5, songChart.durationMs + 100, 3000);
  expect(context.createBufferSource).toHaveBeenCalledTimes(1);
});
it.each([-250, 0, 250])("preserves a %i ms calibration offset when resuming", async offset => {
  const audio = new RhythmAudio();
  await audio.start(buffer, songChart, .5, 2000 + offset, 3000);
  expect(audio.timeAt() - offset).toBeCloseTo(-1000, 0);
  context.currentTime = 13;
  expect(audio.timeAt() - offset).toBeCloseTo(2000, 0);
});
it("cancels pending starts when focus loss or exit stops audio", async () => {
  let resolve!: () => void;
  context.resume.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
  const audio = new RhythmAudio(), pending = audio.start(buffer, songChart, .5);
  audio.stop(); resolve();
  expect(await pending).toBe(false);
  expect(context.createBufferSource).not.toHaveBeenCalled();
});
it("does not let an older pending start interrupt a newer source", async () => {
  let resolve!: () => void;
  context.resume.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
  const audio = new RhythmAudio(), old = audio.start(buffer, songChart, .5);
  expect(await audio.start(buffer, songChart, .5, 1000)).toBe(true);
  resolve(); expect(await old).toBe(false);
  expect(context.createBufferSource).toHaveBeenCalledOnce();
  expect(context.createBufferSource.mock.results[0].value.stop).not.toHaveBeenCalled();
});
it("rejects invalid schedules and reports suspended audio", async () => {
  const audio = new RhythmAudio();
  await expect(audio.start(buffer, songChart, NaN)).rejects.toThrow("Invalid");
  await expect(audio.start(buffer, songChart, .5, -3000)).rejects.toThrow("Invalid");
  await expect(audio.start(buffer, songChart, .5, 0, -1)).rejects.toThrow("Invalid");
  await expect(audio.start(buffer, songChart, .5, 0, 240101)).rejects.toThrow("Invalid");
  context.state = "suspended";
  await expect(audio.start(buffer, songChart, .5)).rejects.toThrow("suspended");
});
