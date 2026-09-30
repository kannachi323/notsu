import { expect, it } from "vitest";
import { createDocument } from "./document";
import { editDocument } from "./commands";
import { difficultyCopy, recoveryCopy } from "./copies";
const doc = editDocument(createDocument("original", { sha256: "a".repeat(64), size: 3, durationMs: 30000, fileName: "Song.wav", mime: "audio/wav" }, "Song"), { type: "place", id: "hold", timeMs: 1000, endMs: 2500, divisor: 4, laneIds: ["line-1"] });
it("preserves every authored field while giving recovery a distinct set/chart identity", () => {
  const copy = recoveryCopy(doc, "recovery");
  expect(copy).toEqual({ ...doc, id: "recovery", setId: "recovery", chart: { ...doc.chart, id: "recovery" } });
  expect(doc.id).toBe("original");
});
it("assigns distinct case-insensitive difficulty names and enforces the set limit", () => {
  const first = difficultyCopy(doc, "first", [doc]);
  const second = difficultyCopy(doc, "second", [doc, { ...first, difficulty: first.difficulty.toUpperCase() }]);
  expect(first.difficulty).toBe("Untitled difficulty copy"); expect(second.difficulty).toBe("Untitled difficulty copy 2");
  expect(second.setId).toBe(doc.setId); expect(second.chart.notes).toEqual(doc.chart.notes);
  expect(() => difficultyCopy(doc, "overflow", Array(16).fill(doc))).toThrow("16 difficulties");
});
