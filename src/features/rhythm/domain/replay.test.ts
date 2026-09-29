import { describe, expect, it } from "vitest";
import { geometryChart } from "../data/geometryChart";
import { chartFingerprint } from "../data/chartFingerprint";
import { loadChart } from "./chart";
import { recordReplay, ReplayPlayer, verifyReplay } from "./replay";
import { RhythmSession } from "./session";

const hash = "a".repeat(64);
const chart = loadChart({
  version: 1, id: "test", title: "Test", artist: "Test", bpm: 120, durationMs: 5000, audioOffsetMs: 0,
  notes: [{ id: "h", kind: "hold", timeMs: 1000, endMs: 3000 },
    { id: "h2", kind: "hold", timeMs: 1500, endMs: 2500 }, { id: "t", kind: "tap", timeMs: 2000 }],
  motion: [{ timeMs: 0, x: .2, y: .5, angle: 0 }],
});

describe("shared hits and physical holds", () => {
  it("scores a four-lane shared tap once and plays overlapping holds on separate keys", () => {
    const shared = new RhythmSession(geometryChart);
    shared.press("F", geometryChart.notes[0].timeMs);
    expect(shared.summary()).toMatchObject({ combo: 1, judged: 1, counts: { Perfect: 1 } });
    const run = new RhythmSession(chart);
    run.press("F", 1000); run.press("J", 1500); run.press("D", 2000);
    run.release("D", 2001); run.release("J", 2500); run.release("F", 3000); run.advance(5000);
    expect(run.summary()).toMatchObject({ score: 1000000, accuracy: 100, maxCombo: 5, health: 100, status: "completed" });
  });
});

describe("recording and playback", () => {
  it("closes the final timing window and still accepts its inclusive endpoint", () => {
    const last = loadChart({ ...chart, notes: [{ id: "last", kind: "tap", timeMs: 4860, laneIds: ["main"] }] });
    const missed = new RhythmSession(last);
    missed.advance(5000);
    expect(missed.summary()).toMatchObject({ status: "completed", judged: 1, counts: { Miss: 1 } });
    for (const frameFirst of [false, true]) {
      const run = new RhythmSession(last);
      if (frameFirst) run.advance(5000);
      run.press("F", 5000); run.advance(5000);
      expect(run.summary()).toMatchObject({ status: "completed", judged: 1, counts: { Okay: 1, Miss: 0 } });
      expect(verifyReplay(last, recordReplay(run, hash), hash)).toEqual(run.summary());
    }
  });
  it("reconciles input timestamps delivered after a speculative render-frame miss", () => {
    const run = new RhythmSession(chart);
    run.advance(1200);
    expect(run.summary().counts.Miss).toBe(2);
    run.drainJudgements();
    run.press("F", 1040);
    expect(run.summary()).toMatchObject({ counts: { Perfect: 1, Miss: 0 }, health: 100 });
    expect(run.drainJudgements().map(event => event.grade)).toEqual(["Perfect"]);
    run.press("J", 1500); run.release("J", 2500); run.release("F", 3000); run.advance(5000);
    expect(verifyReplay(chart, recordReplay(run, hash), hash)).toEqual(run.summary());
  });
  it("reproduces input, misses, health, and score at any render frequency", () => {
    const run = new RhythmSession(chart);
    run.press("KeyF", 1030); run.press("KeyJ", 1580);
    run.release("KeyJ", 2520); run.release("KeyF", 3000); run.advance(5000);
    const replay = recordReplay(run, hash);
    expect(JSON.stringify(replay)).not.toContain("KeyF");
    for (const fps of [10, 30, 60, 144]) {
      const player = new ReplayPlayer(chart, replay, hash);
      for (let time = 0; time < 5000; time += 1000 / fps) player.advance(time);
      player.advance(5000);
      expect(player.session.summary()).toEqual(run.summary());
      const misses = player.session.drainJudgements().filter(event => event.grade === "Miss");
      expect(misses.map(event => event.atMs)).toEqual([2140]);
      player.advance(0); player.advance(5000);
      expect(player.session.summary()).toEqual(run.summary());
    }
    expect(verifyReplay(chart, JSON.parse(JSON.stringify(replay)), hash)).toEqual(run.summary());
  });
  it("rejects edited identities, unsupported versions and malformed input streams", () => {
    const run = new RhythmSession(chart); run.press("F", 1000); run.release("F", 3000);
    const replay = recordReplay(run, hash);
    for (const invalid of [
      { ...replay, chartHash: "b".repeat(64) }, { ...replay, rulesVersion: "unknown" },
      { ...replay, inputs: [...replay.inputs].reverse() },
      { ...replay, inputs: [{ atMs: NaN, key: 0, action: "press" }] },
      { ...replay, inputs: [{ atMs: 1000, key: 0, action: "release" }] },
      { ...replay, mods: { noFail: false, autoplay: true } },
    ]) expect(() => verifyReplay(chart, invalid, hash)).toThrow();
  });
  it("binds the content hash to both choreography and shared visual membership", async () => {
    const baseline = await chartFingerprint(geometryChart);
    const edited = loadChart(geometryChart); edited.lanes[0].motion[0].angle += 1;
    expect(await chartFingerprint(edited)).not.toBe(baseline);
    const changed = loadChart(geometryChart); changed.notes[0].laneIds.pop();
    expect(await chartFingerprint(changed)).not.toBe(baseline);
    const reordered = { ...geometryChart, title: geometryChart.title };
    expect(await chartFingerprint(reordered)).toBe(baseline);
  });
});

describe("failure and practice mods", () => {
  it("weights combo continuity ahead of imperfect but successful timing", () => {
    const source = loadChart({ version: 1, id: "combo", title: "Combo", artist: "Test", bpm: 120,
      durationMs: 5000, audioOffsetMs: 0, motion: [{ timeMs: 0, x: .2, y: .5, angle: 0 }],
      notes: Array.from({ length: 10 }, (_, i) => ({ id: String(i), kind: "tap", timeMs: 1000 + i * 300 })) });
    const full = new RhythmSession(source), broken = new RhythmSession(source);
    for (const [i, note] of source.notes.entries()) {
      full.press("F", note.timeMs + 70); full.release("F", note.timeMs + 71);
      if (i !== 4) { broken.press("F", note.timeMs); broken.release("F", note.timeMs + 1); }
    }
    full.advance(5000); broken.advance(5000);
    expect(full.summary().score).toBe(910000);
    expect(full.summary().score).toBeGreaterThan(broken.summary().score);
    expect(full.summary().accuracy).toBeLessThan(broken.summary().accuracy);
  });
  it("fails at the exact health boundary and stops accepting input", () => {
    const run = new RhythmSession(chart);
    for (let i = 0; i < 30; i++) run.press("key" + i, i);
    expect(run.summary()).toMatchObject({ health: 0, status: "failed", failedAtMs: 24, extra: 25, rankedEligible: false });
  });
  it("No Fail continues to resolve all notes but is never ranked", () => {
    const run = new RhythmSession(chart, { noFail: true });
    for (let i = 0; i < 30; i++) run.press("key" + i, i);
    run.advance(5000);
    expect(run.summary()).toMatchObject({ health: 0, status: "completed", judged: 5, rankedEligible: false });
  });
  it("Autoplay handles shared notes and holds without producing player input or ranked scores", () => {
    const run = new RhythmSession(geometryChart, { autoplay: true });
    run.press("F", 0); run.advance(geometryChart.durationMs);
    expect(run.summary()).toMatchObject({ score: 1000000, judged: run.expected, extra: 0, rankedEligible: false });
    expect(recordReplay(run, hash).inputs).toEqual([]);
    expect(verifyReplay(geometryChart, recordReplay(run, hash), hash)).toEqual(run.summary());
  });
  it("does not award score for unplayed notes", () => {
    expect(new RhythmSession(chart).summary().score).toBe(0);
    const run = new RhythmSession(chart); run.press("F", 1000);
    expect(run.summary().score).toBeGreaterThan(0); expect(run.summary().score).toBeLessThan(1000000);
  });
});
