import { expect, it } from "vitest";
import { createDocument, playableChart, readDocument, restoreDocument } from "./document";
import { editDocument } from "./commands";
import { EditorHistory } from "./history";
import { presetFrames, presetCounts, transformedFrames } from "./choreography";
import { laneAnchor, WORLD_WIDTH, WORLD_HEIGHT } from "../../rhythm/domain/layout";
import { lanePoseAt, loadChart } from "../../rhythm/domain/chart";
import { RhythmSession } from "../../rhythm/domain/session";
import { timeAtBeat } from "../../rhythm/domain/timing";
import type { EditorDocument } from "./document";
import type { GeometryPreset } from "./choreography";
const song = { sha256: "a".repeat(64), fileName: "song.wav", mime: "audio/wav" as const, size: 123456, durationMs: 30000 };
const draft = () => createDocument("draft-1", song, "My song");
const tap = (doc: EditorDocument, at: number, laneIds = ["line-1"], id = "tap-1") => editDocument(doc, { type: "place", id, timeMs: at, laneIds, divisor: 4 });
it("restores a separate identity and validates excerpt bounds against actual decoded media", () => {
  const doc = tap(draft(), 1000);
  const restored = restoreDocument("restored", doc, { ...song, fileName: "Renamed.wav", size: 999 });
  expect(restored.id).toBe("restored"); expect(restored.chart.id).toBe("restored");
  expect(restored.song.fileName).toBe("Renamed.wav"); expect(restored.song.size).toBe(999);
  expect(restored.chart.notes).toEqual(doc.chart.notes);
  expect(() => restoreDocument("restored", doc, { ...song, durationMs: 20000 })).toThrow("duration");
  expect(() => restoreDocument("restored", doc, { ...song, sha256: "b".repeat(64) })).toThrow("match");
});
it("allows an empty editor draft while rejecting empty gameplay charts", () => {
  const doc = draft(); expect(doc.chart.notes).toEqual([]); expect(readDocument(doc)).toEqual(doc);
  expect(() => playableChart(doc)).toThrow(); expect(() => new RhythmSession(doc.chart)).toThrow();
  const chart = playableChart(tap(doc, 1000)); expect(loadChart(chart)).toEqual(chart);
});
it("binds drafts to their song identity and playable excerpt bounds", () => {
  const doc = draft();
  expect(() => readDocument({ ...doc, song: { ...song, sha256: "b".repeat(64) } })).toThrow("match");
  expect(() => readDocument({ ...doc, chart: { ...doc.chart, durationMs: 31000 } })).toThrow("duration");
  expect(() => readDocument({ ...doc, song: { ...song, size: Infinity } })).toThrow("song reference");
});
it("snaps notes to musical divisions and merges simultaneous visual instances", () => {
  let doc = editDocument(draft(), { type: "add-lane", id: "line-2", frame: { timeMs: 0, x: .5, y: .5, angle: 90, length: 160 } });
  const untouched = JSON.stringify(doc);
  doc = tap(doc, 1017); doc = tap(doc, 997, ["line-2"], "not-a-second-judgement");
  expect(doc.chart.notes).toEqual([{ id: "tap-1", kind: "tap", timeMs: 1000, laneIds: ["line-1", "line-2"] }]);
  const session = new RhythmSession(playableChart(doc), { noFail: true, autoplay: false });
  session.press("KeyF", 1000); expect(session.summary().counts.Perfect).toBe(1);
  expect(untouched).not.toContain('"kind":"tap"');
});
it("makes shared holds one logical object and rejects conflicting endpoints", () => {
  const empty = editDocument(draft(), { type: "add-lane", id: "line-2", frame: { timeMs: 0, x: .5, y: .5, angle: 90, length: 160 } });
  const command = { type: "place" as const, id: "hold-1", laneIds: ["line-1"], timeMs: 1000, endMs: 2000, divisor: 4 };
  const first = editDocument(empty, command), shared = editDocument(first, { ...command, id: "other", laneIds: ["line-2"] });
  expect(shared.chart.notes).toHaveLength(1); expect(shared.chart.notes[0].laneIds).toHaveLength(2);
  expect(() => editDocument(first, { ...command, endMs: 2500 })).toThrow("endpoint");
  expect(() => tap(first, 1000)).toThrow("endpoint");
  expect(() => editDocument(empty, { ...command, endMs: 999 })).toThrow("after");
});
it("preserves authored timestamps when adding tempo changes and snaps new notes locally", () => {
  const first = tap(draft(), 1000);
  let doc = editDocument(first, { type: "tempo", timeMs: 4000, bpm: 180 });
  doc = editDocument(doc, { type: "place", id: "triplet", timeMs: 4120, laneIds: ["line-1"], divisor: 3 });
  expect(doc.chart.notes[0].timeMs).toBe(1000); expect(doc.chart.notes[1].timeMs).toBeCloseTo(4111.111, 3);
  expect(timeAtBeat(doc.chart.timing, 11)).toBe(5000);
  expect(() => editDocument(doc, { type: "delete-tempo", timeMs: 0 })).toThrow("required");
  expect(() => editDocument(doc, { type: "tempo", timeMs: 5000, bpm: 0 })).toThrow();
});
it("removes only the deleted line's instances and preserves shared notes", () => {
  let doc = editDocument(draft(), { type: "add-lane", id: "line-2", frame: { timeMs: 0, x: .5, y: .5, angle: 90, length: 160 } });
  doc = tap(doc, 1000, ["line-1", "line-2"]); doc = tap(doc, 2000, ["line-2"], "solo");
  doc = editDocument(doc, { type: "delete-lane", id: "line-2" });
  expect(doc.chart.notes).toHaveLength(1); expect(doc.chart.notes[0].laneIds).toEqual(["line-1"]);
  expect(() => editDocument(doc, { type: "delete-lane", id: "line-1" })).toThrow("at least one");
});
it.each(["triangle", "square", "hexagon"] as GeometryPreset[])("forms a closed %s from independent straight lines", kind => {
  const frames = presetFrames(kind, 0); expect(frames).toHaveLength(presetCounts[kind]);
  frames.forEach((frame, index) => {
    const anchor = laneAnchor(frame, frame.length), next = frames[(index + 1) % frames.length];
    expect(anchor.x + Math.cos(anchor.radians) * frame.length).toBeCloseTo(next.x * WORLD_WIDTH);
    expect(anchor.y + Math.sin(anchor.radians) * frame.length).toBeCloseTo(next.y * WORLD_HEIGHT);
  });
});
it("rotates a group coherently and reaches the authored pose at its keyframe", () => {
  const frames = presetFrames("square", 0), lanes = frames.map((frame, i) => ({ id: `line-${i + 1}`, motion: [frame] }));
  const source = readDocument({ ...draft(), chart: { ...draft().chart, lanes } });
  const rotated = transformedFrames(lanes, 2000, { dx: 0, dy: 0, rotation: 90, scale: 1 });
  const doc = editDocument(source, { type: "motion", frames: rotated.map((frame, i) => ({ laneId: lanes[i].id, frame })) });
  for (const [i, lane] of doc.chart.lanes.entries()) {
    const pose = lanePoseAt(lane, 2000);
    expect(pose.angle).toBeCloseTo(frames[i].angle + 90);
    expect(pose.x).toBeCloseTo(rotated[i].x); expect(pose.y).toBeCloseTo(rotated[i].y);
  }
  expect(source.chart.lanes[0].motion).toHaveLength(1);
  expect(() => editDocument(doc, { type: "delete-motion", laneIds: [lanes[0].id], timeMs: 0 })).toThrow("required");
});
it("undoes and redoes complete edits without exposing mutable history or accepting invalid changes", () => {
  const original = draft(), history = new EditorHistory(original);
  history.apply({ type: "place", id: "hold", laneIds: ["line-1"], timeMs: 1000, endMs: 2000, divisor: 4 });
  const placed = history.document; placed.chart.notes.length = 0; expect(history.document.chart.notes).toHaveLength(1);
  expect(history.undo()).toEqual(original); expect(history.canRedo).toBe(true); expect(history.redo().chart.notes).toHaveLength(1);
  const before = history.document;
  expect(() => history.apply({ type: "place", id: "invalid", laneIds: ["missing"], timeMs: 4000, divisor: 4 })).toThrow();
  expect(history.document).toEqual(before);
  history.undo(); history.apply({ type: "metadata", title: "Revised", artist: "Artist", author: "Mapper", difficulty: "Normal" });
  expect(history.canRedo).toBe(false); expect(history.document.chart.title).toBe("Revised");
});
it("does not create history entries for no-op actions and bounds long sessions", () => {
  const history = new EditorHistory(draft()); history.apply({ type: "delete-note", id: "missing" }); expect(history.canUndo).toBe(false);
  for (let i = 0; i < 105; i++) history.apply({ type: "metadata", title: `Revision ${i}`, artist: "Artist", author: "Mapper", difficulty: "Normal" });
  let undos = 0; while (history.canUndo) { history.undo(); undos++; }
  expect(undos).toBe(100); expect(history.document.chart.title).toBe("Revision 4");
});
