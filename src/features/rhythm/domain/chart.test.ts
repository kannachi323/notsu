import { describe, expect, it } from "vitest";
import { lanePoseAt, loadChart, poseAt, validateChart } from "./chart";
import type { LegacyChart } from "./chart";
import { songChart } from "../data/charts";
import { geometryChart } from "../data/geometryChart";
import { laneAnchor, LANE_LENGTH, WORLD_HEIGHT, WORLD_WIDTH } from "./layout";

const legacy: LegacyChart = {
  version: 1, id: "old", title: "Original", artist: "Test", bpm: 120, durationMs: 4000, audioOffsetMs: 100,
  notes: [{ id: "a", kind: "tap", timeMs: 1000 }, { id: "b", kind: "hold", timeMs: 2000, endMs: 3000 }],
  motion: [{ timeMs: 0, x: .2, y: .5, angle: 0 }, { timeMs: 2500, x: .4, y: .2, angle: 180 }],
};

describe("chart import and validation", () => {
  it("migrates v1 without changing note, audio, or movement timestamps", () => {
    const chart = loadChart(legacy);
    expect(chart).toMatchObject({ version: 2, id: "old", audioOffsetMs: 100, timing: [{ timeMs: 0, bpm: 120 }] });
    expect(chart.notes.map(({ laneIds, ...note }) => { expect(laneIds).toEqual(["main"]); return note; })).toEqual(legacy.notes);
    expect(chart.lanes[0].motion.map(({ length, ...frame }) => { expect(length).toBe(420); return frame; })).toEqual(legacy.motion);
  });
  it("clones nested data so an editor cannot mutate an active imported chart", () => {
    const source = loadChart(geometryChart), chart = loadChart(source);
    source.notes[0].laneIds.pop(); source.lanes[0].motion[0].x = .9;
    expect(chart).toEqual(geometryChart);
  });
  it("rejects separate simultaneous heads and supports shared visual instances", () => {
    expect(() => validateChart({ ...legacy, notes: [{ id: "a", kind: "tap", timeMs: 1000 }, { id: "b", kind: "tap", timeMs: 1000 }] })).toThrow("shared hit");
    expect(() => validateChart(geometryChart)).not.toThrow();
  });
  it("supports independent overlapping holds", () => {
    const chart = loadChart({ ...legacy, notes: [
      { id: "a", kind: "hold", timeMs: 1000, endMs: 3000 },
      { id: "b", kind: "hold", timeMs: 1500, endMs: 2500 },
    ] });
    expect(() => validateChart(chart)).not.toThrow();
  });
  it.each([null, {}, { ...legacy, durationMs: NaN }, { ...legacy, notes: [{ id: "a", kind: "unknown", timeMs: 500 }] },
    { ...legacy, motion: [legacy.motion[1], legacy.motion[0]] }, { ...geometryChart, timing: [{ timeMs: 10, bpm: 120 }] },
    { ...geometryChart, notes: [{ ...geometryChart.notes[0], laneIds: ["missing"] }] },
    { ...geometryChart, notes: [{ ...geometryChart.notes[0], laneIds: ["north", "north"] }] },
  ])("rejects malformed or unplayable chart data", value => { expect(() => loadChart(value)).toThrow(); });
});

describe("choreography", () => {
  const frames = songChart.lanes[0].motion;
  it("arrives exactly at every authored keyframe", () => {
    for (const keyframe of frames) {
      expect(poseAt(frames, keyframe.timeMs)).toMatchObject({ x: keyframe.x, y: keyframe.y, angle: keyframe.angle });
      expect(keyframe.timeMs / (60000 / songChart.timing[0].bpm) % 1).toBe(0);
    }
  });
  it("smooths halfway between poses without overshooting", () => {
    expect(poseAt([{ timeMs: 0, x: 0, y: 0, angle: 0 }, { timeMs: 1000, x: 1, y: 1, angle: 90 }], 500)).toEqual({ x: .5, y: .5, angle: 45 });
  });
  it("interpolates lane length and authored linear movement", () => {
    expect(lanePoseAt({ id: "test", motion: [
      { timeMs: 0, x: .2, y: .2, angle: 0, length: 100 },
      { timeMs: 1000, x: .6, y: .6, angle: 180, length: 300, easing: "linear" },
    ] }, 250)).toMatchObject({ x: .3, y: .3, angle: 45, length: 150 });
  });
  it("keeps legacy gate and lane endpoints in bounds throughout the chart", () => {
    for (let time = 0; time <= songChart.durationMs; time += 10) {
      const p = laneAnchor(poseAt(frames, time));
      for (const distance of [0, LANE_LENGTH]) {
        const x = p.x + Math.cos(p.radians) * distance, y = p.y + Math.sin(p.radians) * distance;
        expect(x).toBeGreaterThanOrEqual(41); expect(x).toBeLessThanOrEqual(WORLD_WIDTH - 41);
        expect(y).toBeGreaterThanOrEqual(41); expect(y).toBeLessThanOrEqual(WORLD_HEIGHT - 41);
      }
    }
  });
});
