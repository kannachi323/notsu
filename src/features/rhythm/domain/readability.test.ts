import { expect, it } from "vitest";
import type { Chart, ChartNote, LaneKeyframe } from "./chartTypes";
import { motionIssues } from "./readability";

const pose = (timeMs: number, x: number, angle: number, easing: LaneKeyframe["easing"] = "linear"): LaneKeyframe =>
  ({ timeMs, x, y: .5, angle, length: 200, easing });
const chart = (motion: LaneKeyframe[], notes: ChartNote[]): Chart => ({
  version: 2, id: "readability", title: "Readability", artist: "notsu", durationMs: 10_000, audioOffsetMs: 0,
  timing: [{ timeMs: 0, bpm: 120 }], lanes: [{ id: "a", motion }], notes,
});
const tap = (timeMs: number): ChartNote => ({ id: `t${timeMs}`, kind: "tap", timeMs, laneIds: ["a"] });

it("flags a fast turn while a note is approaching the lane", () => {
  const issues = motionIssues(chart([pose(0, .5, 0), pose(2000, .5, 0), pose(2250, .5, 180)], [tap(3000)]));
  expect(issues).toEqual([expect.objectContaining({ laneId: "a", kind: "turn" })]);
  expect(issues[0].peak).toBeGreaterThan(600);
});

it("allows the same turn while the lane is empty", () => {
  expect(motionIssues(chart([pose(0, .5, 0), pose(2000, .5, 0), pose(2250, .5, 180)], [tap(5000)]))).toEqual([]);
});

it("allows slow rotation around a fixed target", () => {
  expect(motionIssues(chart([pose(0, .5, 0), pose(4000, .5, 360)], [tap(1000), tap(2000), tap(3000)]))).toEqual([]);
});

it("flags a target that slides quickly under a held note", () => {
  const hold: ChartNote = { id: "h", kind: "hold", timeMs: 1000, endMs: 3000, laneIds: ["a"] };
  const issues = motionIssues(chart([pose(0, .3, 0), pose(2000, .3, 0), pose(2400, .6, 0)], [hold]));
  expect(issues.map(issue => issue.kind)).toEqual(["target"]);
});
