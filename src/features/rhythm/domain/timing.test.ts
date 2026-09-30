import { expect, it } from "vitest";
import { beatAtTime, snapTime, timeAtBeat } from "./timing";

const timing = [{ timeMs: 0, bpm: 120 }, { timeMs: 2000, bpm: 180 }, { timeMs: 3000, bpm: 90 }];
it("converts beats across tempo boundaries without accumulating rounded intervals", () => {
  expect(timeAtBeat(timing, 4)).toBe(2000);
  expect(timeAtBeat(timing, 7)).toBe(3000);
  for (const beat of [0, 1 / 3, 3.5, 4, 5 + 1 / 7, 7, 9.5]) expect(beatAtTime(timing, timeAtBeat(timing, beat))).toBeCloseTo(beat, 10);
});
it("snaps tuplets and clamps at the next timing section", () => {
  expect(snapTime(timing, 170, 3)).toBeCloseTo(500 / 3);
  expect(snapTime(timing, 2140, 7)).toBeCloseTo(2000 + 1000 / 7);
  expect(snapTime([{ timeMs: 0, bpm: 120 }, { timeMs: 950, bpm: 180 }], 940, 1)).toBe(950);
  expect(() => snapTime(timing, 0, 0)).toThrow();
});
