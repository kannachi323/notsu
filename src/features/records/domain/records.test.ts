import { expect, it } from "vitest";
import { bestRecord, comparePerformance, isPersonalBestCandidate, readRecord, runDescription } from "./records";
import { completed, source } from "../data/records.fixture";
import { prepareRecord } from "../data/prepare";
it("orders score, maximum combo, then accuracy without adding a date tie-break to placement", async () => {
  const { summary } = await completed();
  expect(comparePerformance({ ...summary, score: 900000 }, { ...summary, score: 800000 })).toBeGreaterThan(0);
  expect(comparePerformance({ ...summary, maxCombo: 3, accuracy: 80 }, { ...summary, maxCombo: 2, accuracy: 100 })).toBeGreaterThan(0);
  expect(comparePerformance({ ...summary, accuracy: 90 }, { ...summary, accuracy: 80 })).toBeGreaterThan(0);
  expect(comparePerformance(summary, { ...summary })).toBe(0);
});
it("keeps assists, autoplay and failed attempts out of personal bests", async () => {
  const variants = [{ mods: { noFail: true } }, { mods: { autoplay: true } }, { assists: { freezeMotion: true } }, { assists: { resumed: true } }, { fail: true }];
  const practice = await Promise.all(variants.map(async (options, i) => (await prepareRecord(await completed(`practice-${i}`, options), source)).record));
  expect(practice.every(row => !isPersonalBestCandidate(row))).toBe(true); expect(bestRecord(practice)).toBeUndefined();
  const standard = (await prepareRecord(await completed("standard", { errorMs: 70 }), source)).record;
  expect(bestRecord([...practice, standard])).toEqual(standard);
  expect(runDescription(practice[0])).toBe("No Fail"); expect(runDescription(practice[2])).toBe("Frozen lines");
});
it("uses the earliest replay to represent an exact tied best without replacing a better result", async () => {
  const row = (await prepareRecord(await completed(), source)).record;
  const tied = { ...row, id: "later", finishedAt: row.finishedAt + 1 };
  expect(bestRecord([tied, row])?.id).toBe(row.id);
  expect(bestRecord([{ ...row, summary: { ...row.summary, score: 0 } }, tied])?.id).toBe(tied.id);
});
it("rejects invalid dates, score ranges, judgement totals and map identity before UI rendering", async () => {
  const row = (await prepareRecord(await completed(), source)).record;
  for (const invalid of [
    { ...row, revision: "bad" }, { ...row, replayBytes: 0 }, { ...row, finishedAt: Number.MAX_SAFE_INTEGER },
    { ...row, summary: { ...row.summary, score: NaN } }, { ...row, summary: { ...row.summary, score: 1000001 } },
    { ...row, summary: { ...row.summary, counts: { ...row.summary.counts, Miss: 99 } } },
    { ...row, summary: { ...row.summary, status: "playing" } },
  ]) expect(() => readRecord(invalid)).toThrow();
});
