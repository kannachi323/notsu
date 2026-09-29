import { expect, it } from "vitest";
import { createDocument, readDocument } from "./document";
import { editDocument } from "./commands";
import { copyPhrase } from "./noteEditing";
import { EditorHistory } from "./history";
import { lanePoseAt } from "../../rhythm/domain/chart";
import type { EditorCommand } from "./commands";

function draft() {
  const doc = createDocument("editing-test", { sha256: "a".repeat(64), fileName: "song.wav", mime: "audio/wav", size: 1234, durationMs: 30000 }, "Song");
  doc.chart.lanes.push({ id: "line-2", motion: [{ timeMs: 0, x: .5, y: .5, angle: 90, length: 180 }] });
  doc.chart.notes = [
    { id: "tap", kind: "tap", timeMs: 1000, laneIds: ["line-1", "line-2"] },
    { id: "hold", kind: "hold", timeMs: 2000, endMs: 3500, laneIds: ["line-2"] },
  ];
  doc.chart.timing = [{ timeMs: 0, bpm: 120 }, { timeMs: 3000, bpm: 240 }];
  return readDocument(doc);
}

it("moves whole shared phrases as one history entry with immutable source and reversible hold endpoints", () => {
  const original = draft(), history = new EditorHistory(original);
  const moved = history.apply({ type: "move-notes", ids: ["tap", "hold", "tap"], amount: 123.456, unit: "ms" });
  expect(moved.chart.notes).toEqual([
    { ...original.chart.notes[0], timeMs: 1123.456 }, { ...original.chart.notes[1], timeMs: 2123.456, endMs: 3623.456 },
  ]);
  expect(original).toEqual(draft()); expect(history.undo()).toEqual(original);
  expect(history.canUndo).toBe(false); expect(history.redo()).toEqual(moved);
});
it("moves starts and ends by musical beats across tempo changes", () => {
  const moved = editDocument(draft(), { type: "move-notes", ids: ["hold"], amount: 3, unit: "beats" });
  expect(moved.chart.notes[1]).toMatchObject({ timeMs: 3250, endMs: 4250 });
  const returned = editDocument(moved, { type: "move-notes", ids: ["hold"], amount: -3, unit: "beats" });
  expect(returned).toEqual(draft());
});
it("copies musical spacing and shared instances into a faster section with fresh identities", () => {
  const original = draft(), phrase = copyPhrase(original.chart, ["hold", "tap"]);
  expect(phrase).toEqual([{ beat: 0, laneIds: ["line-1", "line-2"] }, { beat: 2, endBeat: 6, laneIds: ["line-2"] }]);
  const pasted = editDocument(original, { type: "paste-notes", phrase, ids: ["copy-tap", "copy-hold"], timeMs: 4001, divisor: 4 });
  expect(pasted.chart.notes.slice(2)).toEqual([
    { id: "copy-tap", kind: "tap", timeMs: 4000, laneIds: ["line-1", "line-2"] },
    { id: "copy-hold", kind: "hold", timeMs: 4500, endMs: 5500, laneIds: ["line-2"] },
  ]);
  phrase[0].laneIds.length = 0; expect(original.chart.notes[0].laneIds).toHaveLength(2);
});
it("edits exact endpoints and shared lines and converts holds without retaining a hidden end", () => {
  const history = new EditorHistory(draft());
  const hold = history.apply({ type: "edit-note", id: "tap", timeMs: 1123.4567, endMs: 1456.789, laneIds: ["line-1"] });
  expect(hold.chart.notes[0]).toEqual({ id: "tap", kind: "hold", timeMs: 1123.457, endMs: 1456.789, laneIds: ["line-1"] });
  const tap = history.apply({ type: "edit-note", id: "tap", timeMs: 1100, laneIds: ["line-2", "line-2"] });
  expect(tap.chart.notes[0]).toEqual({ id: "tap", kind: "tap", timeMs: 1100, laneIds: ["line-2"] });
  expect(history.undo()).toEqual(hold);
});
it("snaps both hold endpoints locally at tempo anchors and preserves tuplets", () => {
  const doc = draft(); doc.chart.timing[1].timeMs = 3100;
  doc.chart.notes[0].timeMs = 1087;
  doc.chart.notes[1] = { ...doc.chart.notes[1], kind: "hold", timeMs: 3140, endMs: 3480 };
  const snapped = editDocument(doc, { type: "snap-notes", ids: ["tap", "hold"], divisor: 3 });
  expect(snapped.chart.notes[0].timeMs).toBeCloseTo(1166.667, 3);
  expect(snapped.chart.notes[1]).toMatchObject({ timeMs: 3100, endMs: 3516.667 });
});
it("reassigns shared instances and deletes selections atomically", () => {
  const history = new EditorHistory(draft());
  const assigned = history.apply({ type: "assign-note-lanes", ids: ["tap", "hold"], laneIds: ["line-1", "line-2"] });
  expect(assigned.chart.notes.map(note => note.laneIds)).toEqual([["line-1", "line-2"], ["line-1", "line-2"]]);
  expect(history.apply({ type: "delete-notes", ids: ["tap", "hold"] }).chart.notes).toEqual([]);
  expect(history.undo()).toEqual(assigned); expect(history.undo()).toEqual(draft());
});
const invalid: [string, EditorCommand][] = [
  ["head collision", { type: "move-notes", ids: ["tap"], amount: 1000, unit: "ms" }],
  ["negative start", { type: "move-notes", ids: ["tap", "hold"], amount: -1001, unit: "ms" }],
  ["hold outside song", { type: "move-notes", ids: ["hold"], amount: 28000, unit: "ms" }],
  ["non-finite amount", { type: "move-notes", ids: ["tap"], amount: NaN, unit: "beats" }],
  ["missing selection", { type: "move-notes", ids: ["missing"], amount: 1, unit: "ms" }],
  ["empty selection", { type: "delete-notes", ids: [] }],
  ["removed lines", { type: "assign-note-lanes", ids: ["tap"], laneIds: ["missing"] }],
  ["orphan circle", { type: "assign-note-lanes", ids: ["hold"], laneIds: [] }],
  ["backward hold", { type: "edit-note", id: "hold", timeMs: 2000, endMs: 1999, laneIds: ["line-1"] }],
  ["invalid time", { type: "edit-note", id: "tap", timeMs: Infinity, laneIds: ["line-1"] }],
  ["paste collision", { type: "paste-notes", phrase: copyPhrase(draft().chart, ["tap"]), ids: ["new"], timeMs: 1000, divisor: 4 }],
  ["duplicate identity", { type: "paste-notes", phrase: copyPhrase(draft().chart, ["tap"]), ids: ["tap"], timeMs: 5000, divisor: 4 }],
  ["paste past end", { type: "paste-notes", phrase: copyPhrase(draft().chart, ["tap", "hold"]), ids: ["new1", "new2"], timeMs: 29000, divisor: 4 }],
];
it.each(invalid)("rejects %s without changing history or the source", (_, command) => {
  const original = draft(), history = new EditorHistory(original);
  expect(() => history.apply(command)).toThrow(); expect(history.document).toEqual(original); expect(history.canUndo).toBe(false); expect(original).toEqual(draft());
});
it("rejects snapping that collapses holds or merges neighboring heads", () => {
  const doc = draft(); doc.chart.notes[1] = { ...doc.chart.notes[1], kind: "hold", timeMs: 2001, endMs: 2002 };
  expect(() => editDocument(doc, { type: "snap-notes", ids: ["hold"], divisor: 4 })).toThrow("ends");
  doc.chart.notes[1] = { ...doc.chart.notes[1], kind: "hold", timeMs: 1002, endMs: 2000 };
  expect(() => editDocument(doc, { type: "snap-notes", ids: ["hold"], divisor: 4 })).toThrow("same time");
});
it("changes destination easing without replacing geometry and rolls back incomplete groups", () => {
  const doc = draft(); const lane = doc.chart.lanes[0];
  lane.motion.push({ timeMs: 4000, x: .8, y: .7, angle: 120, length: 200, easing: "smooth" });
  const history = new EditorHistory(doc), linear = history.apply({ type: "easing", laneIds: [lane.id], timeMs: 4000, easing: "linear" });
  expect(linear.chart.lanes[0].motion[1]).toEqual({ ...lane.motion[1], easing: "linear" });
  expect(lanePoseAt(linear.chart.lanes[0], 1000).x).toBeCloseTo(lane.motion[0].x + (.8 - lane.motion[0].x) * .25);
  expect(lanePoseAt(doc.chart.lanes[0], 1000).x).not.toBeCloseTo(lanePoseAt(linear.chart.lanes[0], 1000).x);
  expect(() => history.apply({ type: "easing", laneIds: ["line-1", "line-2"], timeMs: 4000, easing: "smooth" })).toThrow("Each selected");
  expect(history.document).toEqual(linear); expect(history.undo()).toEqual(doc);
});
