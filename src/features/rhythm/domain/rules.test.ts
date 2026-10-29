import { describe, expect, it } from "vitest";
import { ACCURACY_WEIGHTS, HEALTH_CHANGE, HIT_WINDOW_MS, gradeFor, maximumComboCredit } from "./rules";
import { RhythmSession } from "./session";
import type { LegacyChart, Note } from "./chart";

const taps = (...times: number[]): Note[] => times.map((timeMs, i) => ({ id: `n${i}`, kind: "tap", timeMs }));
const chart = (notes: Note[], durationMs = 5000): LegacyChart => ({
  version: 1, id: "rules", title: "Rules", artist: "Test", bpm: 120, durationMs, audioOffsetMs: 0, notes,
  motion: [{ timeMs: 0, x: .2, y: .5, angle: 0 }],
});

describe("judgement window edges", () => {
  // Inputs carry fractional audio-clock timestamps, so check just past each edge too.
  it.each([
    [44.999, "Perfect"], [45.001, "Good"], [-45.001, "Good"],
    [89.999, "Good"], [90.001, "Okay"], [-90.001, "Okay"],
    [139.999, "Okay"], [140.001, "Miss"], [-140.001, "Miss"],
  ])("grades %s ms as %s", (error, grade) => {
    expect(gradeFor(Number(error))).toBe(grade);
  });

  it("treats a press just outside the early window as an extra and keeps the note playable", () => {
    const run = new RhythmSession(chart(taps(1000)));
    run.press("KeyA", 1000 - HIT_WINDOW_MS - .5);
    run.release("KeyA", 900);
    run.press("KeyA", 1000);
    const summary = run.summary();
    expect(summary.extra).toBe(1);
    expect(summary.counts.Perfect).toBe(1);
  });

  it("misses a tap only after its late edge has passed", () => {
    const run = new RhythmSession(chart(taps(1000)));
    run.advance(1000 + HIT_WINDOW_MS);
    expect(run.summary().counts.Miss).toBe(0);
    run.advance(1000 + HIT_WINDOW_MS + .001);
    expect(run.summary().counts.Miss).toBe(1);
  });
});

describe("score, accuracy and health", () => {
  it("matches the published formula for an unbroken run of mixed grades", () => {
    const run = new RhythmSession(chart(taps(1000, 2000, 3000)));
    run.press("KeyA", 1000); run.release("KeyA", 1010);
    run.press("KeyA", 2060); run.release("KeyA", 2070);
    run.press("KeyA", 3120); run.release("KeyA", 3130);
    run.advance(5000);
    const summary = run.summary();
    const accuracy = (ACCURACY_WEIGHTS.Perfect + ACCURACY_WEIGHTS.Good + ACCURACY_WEIGHTS.Okay) / 3;
    // An unbroken combo earns the full 70% combo share.
    expect(summary.score).toBe(Math.round(1_000_000 * (.7 + .3 * accuracy)));
    expect(summary.score).toBe(900_000);
    expect(summary.accuracy).toBeCloseTo(accuracy * 100, 10);
    expect(summary.maxCombo).toBe(3);
    expect(summary.meanErrorMs).toBeCloseTo(60, 10);
    expect(summary.status).toBe("completed");
    expect(summary.rankedEligible).toBe(true);
  });

  it("charges extras in both the combo and accuracy shares", () => {
    const run = new RhythmSession(chart(taps(1000, 2000, 3000)));
    run.press("KeyA", 1000); run.release("KeyA", 1010);
    run.press("KeyA", 1500); run.release("KeyA", 1510); // Nothing within 140 ms.
    run.press("KeyA", 2060); run.release("KeyA", 2070);
    run.press("KeyA", 3120); run.release("KeyA", 3130);
    run.advance(5000);
    const summary = run.summary();
    const comboShare = (1 + 1 + Math.SQRT2) / maximumComboCredit(3);
    const earned = ACCURACY_WEIGHTS.Perfect + ACCURACY_WEIGHTS.Good + ACCURACY_WEIGHTS.Okay;
    expect(summary.extra).toBe(1);
    expect(summary.score).toBe(Math.round(1_000_000 * (.7 * comboShare + .3 * earned / 4)));
    expect(summary.accuracy).toBeCloseTo(earned / 4 * 100, 10);
    expect(summary.maxCombo).toBe(2);
    // 100 (clamped after Perfect) - 4 (extra) + 1 (Good) + 0 (Okay).
    expect(summary.health).toBe(100 + HEALTH_CHANGE.Extra + HEALTH_CHANGE.Good + HEALTH_CHANGE.Okay);
  });

  it("accumulates combo credit as the square root of each running combo", () => {
    expect(maximumComboCredit(0)).toBe(0);
    expect(maximumComboCredit(4)).toBeCloseTo(1 + Math.SQRT2 + Math.sqrt(3) + 2, 12);
  });

  it("clamps health at full and fails exactly when it reaches zero", () => {
    const notes = taps(...Array.from({ length: 10 }, (_, i) => 1000 + i * 300));
    const run = new RhythmSession(chart(notes, 6000));
    run.press("KeyA", 1000); run.release("KeyA", 1010);
    expect(run.summary().health).toBe(100);
    // Eight misses leave 4%; the ninth reaches zero and ends the attempt.
    run.advance(1000 + 8 * 300 + HIT_WINDOW_MS + 1);
    expect(run.summary().counts.Miss).toBe(8);
    expect(run.summary().health).toBe(4);
    expect(run.status).toBe("playing");
    run.advance(1000 + 9 * 300 + HIT_WINDOW_MS + 1);
    expect(run.status).toBe("failed");
    expect(run.summary().failedAtMs).toBe(1000 + 9 * 300 + HIT_WINDOW_MS);
    expect(run.summary().rankedEligible).toBe(false);
  });

  it("never awards score for notes that have not been judged", () => {
    const run = new RhythmSession(chart(taps(1000, 2000)));
    run.press("KeyA", 1000);
    expect(run.summary().score).toBeLessThan(1_000_000 / 2);
    expect(run.summary().judged).toBe(1);
  });
});

describe("render-loop helpers", () => {
  it("fills a reused buffer without duplicating held notes", () => {
    const run = new RhythmSession(chart([{ id: "h", kind: "hold", timeMs: 1000, endMs: 2500 }, ...taps(1200)]));
    const buffer = [run.states[0]];
    run.press("KeyA", 1000);
    const shown = run.visibleStates(1100, buffer);
    expect(shown).toBe(buffer);
    expect(shown.map(state => state.note.id)).toEqual(["h", "n0"]);
  });

  it("reports status without building a summary and drains nothing when idle", () => {
    const run = new RhythmSession(chart(taps(1000)));
    expect(run.status).toBe("playing");
    expect(run.drainJudgements()).toHaveLength(0);
    run.advance(5000);
    expect(run.status).toBe(run.summary().status);
  });
});
