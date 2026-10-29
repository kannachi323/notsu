import { describe, expect, it } from "vitest";
import { isPerfect, letterGrade, timingHistogram } from "./grade";

const summary = (accuracy: number, miss = 0, extra = 0, status: "completed" | "failed" = "completed") =>
  ({ status, accuracy, extra, counts: { Perfect: 0, Good: 0, Okay: 0, Miss: miss } });

describe("letterGrade", () => {
  it.each([
    [summary(100), "S"], [summary(97), "S"], [summary(97, 1), "A"], [summary(99, 0, 1), "A"],
    [summary(90), "A"], [summary(85), "B"], [summary(72), "C"], [summary(40), "D"], [summary(100, 0, 0, "failed"), "F"],
  ])("grades %o as %s", (input, grade) => expect(letterGrade(input)).toBe(grade));
});

it("marks only clean 100% clears as perfect", () => {
  expect(isPerfect(summary(100))).toBe(true);
  expect(isPerfect(summary(100, 0, 1))).toBe(false);
  expect(isPerfect(summary(100, 0, 0, "failed"))).toBe(false);
});

describe("timingHistogram", () => {
  it("bins errors across the window and clamps the inclusive edges", () => {
    expect(timingHistogram([-140, -1, 0, 1, 139.9, 140], 140, 4)).toEqual([1, 1, 2, 2]);
    expect(timingHistogram([], 140, 3)).toEqual([0, 0, 0]);
  });
});
