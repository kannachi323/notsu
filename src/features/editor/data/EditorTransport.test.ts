import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditorTransport, defaultPlayback } from "./EditorTransport";
import type { EditorPlayback } from "./EditorTransport";
import { createDocument } from "../domain/document";

const chart = createDocument("transport", { sha256: "a".repeat(64), fileName: "song.wav", mime: "audio/wav", durationMs: 16000, size: 1000 }, "Song").chart;
const recording = { duration: 16 } as AudioBuffer;
const source = () => ({ buffer: null as AudioBuffer | null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (() => void) | null });
function mockContext() {
  return { currentTime: 10, state: "running", sampleRate: 48000, baseLatency: 0, outputLatency: 0, destination: {},
    createGain: vi.fn(() => ({ gain: { value: 1, setTargetAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() })),
    createBuffer: vi.fn((_channels: number, length: number, rate: number) => { const samples = new Float32Array(length); return { duration: length / rate, getChannelData: () => samples }; }),
    createBufferSource: vi.fn(source), resume: vi.fn(async () => {}), close: vi.fn(async () => {}),
  };
}
let context: ReturnType<typeof mockContext>;
let transports: EditorTransport[];
beforeEach(() => {
  vi.useFakeTimers(); context = mockContext(); transports = [];
  vi.stubGlobal("AudioContext", class { constructor() { return context; } });
});
afterEach(() => { for (const transport of transports) transport.dispose(); vi.useRealTimers(); vi.unstubAllGlobals(); });
function make() { const failure = vi.fn(), transport = new EditorTransport(failure); transports.push(transport); return { transport, failure }; }
function advance(to: number) {
  context.currentTime = to;
  for (const { value: node } of context.createBufferSource.mock.results) {
    const at = node.start.mock.calls[0]?.[0];
    if (at !== undefined && at + (node.buffer?.duration ?? 0) <= to && node.onended) node.onended();
  }
  vi.advanceTimersByTime(25);
}
function runTo(to: number) { while (context.currentTime + .025 < to) advance(context.currentTime + .025); advance(to); }
function clicks() { return context.createBufferSource.mock.results.map(result => result.value).filter(node => node.buffer !== recording); }
function clickTimes() { return clicks().map(node => +Number(node.start.mock.calls[0][0]).toFixed(6)); }
const options = (changes: Partial<EditorPlayback> = {}): EditorPlayback => ({ ...defaultPlayback, ...changes });

it("starts music from the exact cursor with a bounded scheduling lead and no unwanted clicks", async () => {
  const { transport } = make(); expect(await transport.start(recording, chart, 1234, options())).toBe(true);
  const song = context.createBufferSource.mock.results[0].value;
  expect(song.start).toHaveBeenCalledWith(10.06, 1.234, 14.766); expect(clicks()).toHaveLength(0);
  expect(transport.sample()).toEqual({ timeMs: 1234, remaining: 0 });
  advance(10.56); expect(transport.sample().timeMs).toBeCloseTo(1734, 5);
});
it("schedules four audible count-in beats and the first grid beat on the same clock as music", async () => {
  const { transport } = make(); await transport.start(recording, chart, 0, options({ metronome: true, countInBeats: 4 }));
  expect(context.createBufferSource.mock.results[0].value.start.mock.calls[0][0]).toBeCloseTo(12.06);
  expect(transport.sample()).toEqual({ timeMs: 0, remaining: 4 });
  runTo(11.06); expect(transport.sample()).toEqual({ timeMs: 0, remaining: 2 });
  runTo(12.06); expect(clickTimes()).toEqual([10.06, 10.56, 11.06, 11.56, 12.06]);
  expect(transport.sample().remaining).toBe(0);
});
it("keeps scheduling independent of output latency while display countdown follows heard time", async () => {
  context.baseLatency = .1; context.outputLatency = .2;
  const { transport } = make(); await transport.start(recording, chart, 8000, options({ countInBeats: 2 }));
  expect(clickTimes()).toEqual([10.06]); expect(transport.sample().timeMs).toBe(8000);
  runTo(11.06); expect(transport.sample().remaining).toBe(1);
  runTo(11.36); expect(transport.sample().remaining).toBe(0); expect(transport.sample().timeMs).toBeCloseTo(8000);
});
it("counts in even when metronome is off and respects off-grid playback positions", async () => {
  const { transport } = make(); await transport.start(recording, chart, 250, options({ countInBeats: 2 }));
  runTo(12); expect(clickTimes()).toEqual([10.06, 10.56]);
  transport.stop(); context.currentTime = 20;
  await transport.start(recording, chart, 250, options({ metronome: true, countInBeats: 2 }));
  runTo(21.35); expect(clickTimes().slice(2)).toEqual([20.06, 20.56, 21.31]);
});
it("reanchors clicks at tempo changes and schedules fractional times without drift", async () => {
  const { transport } = make(); await transport.start(recording, { ...chart, timing: [{ timeMs: 0, bpm: 120 }, { timeMs: 1125, bpm: 180 }] }, 1000, options({ metronome: true }));
  runTo(10.75); expect(clickTimes()).toEqual([10.06, 10.185, 10.518333, 10.851667]);
});
it("skips overdue beats after a stalled callback instead of bursting late clicks", async () => {
  const { transport } = make(); await transport.start(recording, chart, 0, options({ metronome: true }));
  advance(13.2); expect(clickTimes()).toEqual([10.06]);
  advance(13.45); expect(clickTimes()).toEqual([10.06, 13.56]);
});
it("cancels pending clicks on disable and rebuilds future beats when re-enabled without moving music", async () => {
  const { transport } = make(); await transport.start(recording, chart, 0, options({ metronome: true }));
  const first = clicks()[0], song = context.createBufferSource.mock.results[0].value;
  transport.configure(options()); expect(first.stop).toHaveBeenCalledOnce(); expect(first.disconnect).toHaveBeenCalledOnce();
  advance(10.3); transport.configure(options({ metronome: true, musicVolume: .2, clickVolume: .8 })); advance(10.45);
  expect(clickTimes()).toEqual([10.06, 10.56]); expect(song.stop).not.toHaveBeenCalled();
  expect(context.createGain.mock.results[0].value.gain.setTargetAtTime).toHaveBeenLastCalledWith(.2, 10.3, .01);
  expect(context.createGain.mock.results[1].value.gain.setTargetAtTime).toHaveBeenLastCalledWith(.8, 10.3, .01);
});
it("stops music, queued sounds and timers together and permits idempotent cleanup", async () => {
  const { transport } = make(); await transport.start(recording, chart, 0, options({ metronome: true, countInBeats: 4 }));
  expect(vi.getTimerCount()).toBe(1); transport.stop(); transport.stop();
  expect(transport.running).toBe(false); expect(vi.getTimerCount()).toBe(0);
  for (const { value: node } of context.createBufferSource.mock.results) { expect(node.stop).toHaveBeenCalledOnce(); expect(node.disconnect).toHaveBeenCalledOnce(); }
  expect(transport.sample()).toEqual({ timeMs: 0, remaining: 0 });
});
it("cancels a pending start without permitting a late song or metronome", async () => {
  let resolve!: () => void; context.resume.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
  const { transport } = make(), pending = transport.start(recording, chart, 0, options({ metronome: true }));
  transport.stop(); resolve(); expect(await pending).toBe(false);
  expect(context.createBufferSource).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it("protects a newer start from an earlier pending resume", async () => {
  let resolve!: () => void; context.resume.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
  const { transport } = make(), old = transport.start(recording, chart, 0, options({ countInBeats: 4 }));
  await transport.start(recording, chart, 1000, options({ metronome: true })); resolve(); expect(await old).toBe(false);
  expect(vi.getTimerCount()).toBe(1); expect(clickTimes()).toEqual([10.06]);
  expect(context.createBufferSource.mock.results[0].value.stop).not.toHaveBeenCalled();
});
it("applies the latest volume and metronome settings after an asynchronous audio resume", async () => {
  let resolve!: () => void; context.resume.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
  const { transport } = make(), pending = transport.start(recording, chart, 0, options());
  transport.configure(options({ metronome: true, musicVolume: .2, clickVolume: .8 })); resolve();
  expect(await pending).toBe(true); expect(clickTimes()).toEqual([10.06]);
  expect(context.createGain.mock.results[0].value.gain.setTargetAtTime).toHaveBeenLastCalledWith(.2, 10, .01);
  expect(context.createGain.mock.results[1].value.gain.value).toBe(.8);
});
it("reports suspension and excessive tempo density without leaving audio or timers running", async () => {
  const { transport, failure } = make(); await transport.start(recording, chart, 0, options({ metronome: true }));
  context.state = "suspended"; advance(10.02); expect(failure).toHaveBeenCalledWith(expect.stringContaining("suspended"));
  expect(transport.running).toBe(false); expect(vi.getTimerCount()).toBe(0);
  context.state = "running";
  expect(await transport.start(recording, { ...chart, timing: Array.from({ length: 100 }, (_, timeMs) => ({ timeMs, bpm: 120 })) }, 0, options({ metronome: true }))).toBe(false);
  expect(failure).toHaveBeenLastCalledWith(expect.stringContaining("dense")); expect(vi.getTimerCount()).toBe(0);
});
it("supports the slowest count-in, validates controls and bounds original click samples", async () => {
  const { transport } = make(); await transport.start(recording, { ...chart, timing: [{ timeMs: 0, bpm: 1 }] }, 0, options({ countInBeats: 4 }));
  expect(context.createBufferSource.mock.results[0].value.start.mock.calls[0][0]).toBeCloseTo(250.06);
  expect(clicks()).toHaveLength(1); expect(context.createBuffer).toHaveBeenCalledTimes(2);
  for (const { value: buffer } of context.createBuffer.mock.results) {
    const pcm: Float32Array = buffer.getChannelData(); expect(buffer.duration).toBeLessThanOrEqual(.036); expect(pcm[0]).toBe(0);
    expect(pcm.some(value => Math.abs(value) > .1)).toBe(true); expect(pcm.every(value => Number.isFinite(value) && Math.abs(value) <= .35)).toBe(true);
  }
  await expect(transport.start(recording, chart, 0, options({ clickVolume: NaN }))).rejects.toThrow("Invalid");
  expect(() => transport.configure(options({ musicVolume: 2 }))).toThrow("Invalid");
});
