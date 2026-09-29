import { expect, it } from "vitest";
import { beatsInRange, countInPlan } from "./metronome";

it("uses half-open windows with no duplicated boundary beats", () => {
  const timing = [{ timeMs: 0, bpm: 120 }];
  expect([...beatsInRange(timing, -100, 500), ...beatsInRange(timing, 500, 1500)]).toEqual([
    { timeMs: 0, accent: true }, { timeMs: 500, accent: false }, { timeMs: 1000, accent: false },
  ]);
  expect(beatsInRange(timing, 1, 499)).toEqual([]);
});
it("reanchors on fractional tempo changes without leaking a prior section's next beat", () => {
  const timing = [{ timeMs: 0, bpm: 120 }, { timeMs: 1125, bpm: 180 }];
  const beats = beatsInRange(timing, 900, 1900);
  expect(beats.map(beat => beat.accent)).toEqual([false, true, false, false]);
  expect(beats.map(beat => Math.round(beat.timeMs * 1000) / 1000)).toEqual([1000, 1125, 1458.333, 1791.667]);
});
it("does not duplicate a tempo anchor that also ends the previous beat", () => {
  expect(beatsInRange([{ timeMs: 0, bpm: 120 }, { timeMs: 1000, bpm: 90 }], 500, 1200)).toEqual([
    { timeMs: 500, accent: false }, { timeMs: 1000, accent: true },
  ]);
});
it("counts into an off-grid cursor using its local tempo, including before chart zero", () => {
  const timing = [{ timeMs: 0, bpm: 120 }, { timeMs: 2000, bpm: 240 }];
  expect(countInPlan(timing, 250, 2)).toEqual({ beatMs: 500, durationMs: 1000, clicks: [-750, -250] });
  expect(countInPlan(timing, 2100, 4)).toEqual({ beatMs: 250, durationMs: 1000, clicks: [1100, 1350, 1600, 1850] });
  expect(countInPlan(timing, 2100, 0).clicks).toEqual([]);
});
it("supports the chart tempo limits and bounds pathological click density", () => {
  expect(countInPlan([{ timeMs: 0, bpm: 1 }], 0, 4).durationMs).toBe(240000);
  expect(countInPlan([{ timeMs: 0, bpm: 1000 }], 0, 4).durationMs).toBe(240);
  const dense = Array.from({ length: 100 }, (_, timeMs) => ({ timeMs, bpm: 120 }));
  expect(() => beatsInRange(dense, 0, 150)).toThrow("dense");
  expect(() => countInPlan(dense, 0, 3)).toThrow(); expect(() => beatsInRange(dense, NaN, 150)).toThrow();
});
