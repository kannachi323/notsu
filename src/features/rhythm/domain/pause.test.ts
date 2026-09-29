import { describe, expect, it } from "vitest";
import { loadChart } from "./chart";
import { PauseCheckpoint } from "./pause";
import { recordReplay, verifyReplay } from "./replay";
import { RhythmSession } from "./session";

const chart = loadChart({ version: 1, id: "pause", title: "Pause", artist: "Test", durationMs: 5000, audioOffsetMs: 0, bpm: 120,
  motion: [{ timeMs: 0, x: .2, y: .5, angle: 0 }],
  notes: [{ id: "h1", kind: "hold", timeMs: 1000, endMs: 3000 },
    { id: "h2", kind: "hold", timeMs: 1500, endMs: 3500 }, { id: "t", kind: "tap", timeMs: 2000 }],
});
const hash = "c".repeat(64);

describe("practice resume", () => {
  it("requires all overlapping holds to be re-grabbed without scoring them again", () => {
    const run = new RhythmSession(chart);
    run.press("KeyF", 1000); run.press("KeyJ", 1500); run.press("KeyD", 2000);
    const checkpoint = new PauseCheckpoint(run, 2200);
    expect(checkpoint.requiredKeys).toEqual(["KeyF", "KeyJ"]);
    expect(run.pressedKeys()).toEqual(["KeyF", "KeyJ"]); // Lost tap-key keyups do not get stuck.
    expect(checkpoint.ready).toBe(false);
    checkpoint.setKey("KeyX", true); checkpoint.setKey("KeyF", true);
    expect(() => checkpoint.complete(2200)).toThrow("Re-grab");
    checkpoint.setKey("KeyJ", true); checkpoint.setKey("KeyF", false);
    expect(checkpoint.missingKeys).toEqual(["KeyF"]);
    checkpoint.setKey("KeyF", true); checkpoint.complete(2200);
    expect(run.summary()).toMatchObject({ counts: { Perfect: 3, Miss: 0 }, extra: 0, assists: { resumed: true } });
    run.release("KeyF", 3000); run.release("KeyJ", 3500); run.advance(5000);
    expect(run.summary()).toMatchObject({ score: 1000000, judged: 5, rankedEligible: false });
    expect(verifyReplay(chart, recordReplay(run, hash), hash)).toEqual(run.summary());
  });
  it("does not mark a paused run as resumed until countdown completes", () => {
    const run = new RhythmSession(chart);
    const checkpoint = new PauseCheckpoint(run, -500);
    expect(checkpoint.ready).toBe(true);
    expect(run.assists.resumed).toBe(false);
    expect(() => checkpoint.complete(-501)).toThrow("count-in");
    expect(run.assists.resumed).toBe(false);
    checkpoint.complete(-500);
    expect(run.assists.resumed).toBe(true);
    expect(new RhythmSession(chart).assists.resumed).toBe(false);
  });
  it("does not re-grab simulated keys or rewrite replay eligibility", () => {
    for (const autoplay of [false, true]) {
      const run = new RhythmSession(chart, { autoplay });
      if (!autoplay) run.press("0", 1000);
      run.advance(1200);
      const checkpoint = new PauseCheckpoint(run, 1200, true);
      checkpoint.complete(1200);
      expect(checkpoint.requiredKeys).toEqual([]);
      expect(run.assists.resumed).toBe(false);
      expect(run.inputHistory()).toHaveLength(autoplay ? 0 : 1);
    }
  });
  it("rejects a pause position older than the last timestamped input", () => {
    const run = new RhythmSession(chart); run.press("F", 1000);
    expect(() => new PauseCheckpoint(run, 999)).toThrow();
    expect(() => new PauseCheckpoint(run, NaN)).toThrow();
  });
  it("retains assisted eligibility through replay round trips and rejects missing flags", () => {
    const run = new RhythmSession(chart, {}, { freezeMotion: true });
    run.press("F", 1000); run.press("J", 1500); run.press("D", 2000);
    run.release("F", 3000); run.release("J", 3500); run.advance(5000);
    expect(run.summary()).toMatchObject({ score: 1000000, rankedEligible: false });
    const replay = recordReplay(run, hash);
    expect(verifyReplay(chart, replay, hash)).toEqual(run.summary());
    expect(() => verifyReplay(chart, { ...replay, assists: undefined }, hash)).toThrow();
    expect(() => verifyReplay(chart, { ...replay, assists: { freezeMotion: "yes", resumed: false } }, hash)).toThrow();
    const copy = run.assists; (copy as { freezeMotion: boolean }).freezeMotion = false;
    expect(run.assists.freezeMotion).toBe(true);
  });
});
