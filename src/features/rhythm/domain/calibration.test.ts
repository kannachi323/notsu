import { describe, expect, it } from "vitest";
import { calibrationOffset } from "./calibration";

const clicks = Array.from({ length: 16 }, (_, i) => 1000 + i * 600);

describe("calibrationOffset", () => {
  it("suggests the median lateness rounded to the 5 ms settings step", () => {
    const taps = clicks.slice(4).map((click, i) => click + 32 + (i % 3) * 2);
    expect(calibrationOffset(taps, clicks, 600)).toBe(35);
  });
  it("supports early players and ignores stray taps between clicks", () => {
    const taps = [...clicks.slice(2).map(click => click - 21), 1300, 2500];
    expect(calibrationOffset(taps, clicks, 600)).toBe(-20);
  });
  it("needs enough on-beat taps", () => {
    expect(calibrationOffset(clicks.slice(0, 7), clicks, 600)).toBeNull();
    expect(calibrationOffset([1, 2, 3], [], 600)).toBeNull();
  });
  it("clamps to the supported offset range", () => {
    expect(calibrationOffset(clicks.map(click => click + 230), clicks, 600)).toBe(230);
    expect(calibrationOffset(clicks.map(click => click + 239), clicks, 2000)).toBe(240);
    const slow = Array.from({ length: 10 }, (_, i) => i * 2000);
    expect(calibrationOffset(slow.map(click => click + 400), slow, 2000)).toBe(250);
  });
});
