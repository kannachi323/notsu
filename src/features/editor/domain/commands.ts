import type { ChartNote, LaneKeyframe } from "../../rhythm/domain/chart";
import { snapTime } from "../../rhythm/domain/timing";
import { HIT_WINDOW_MS } from "../../rhythm/domain/rules";
import { readDocument } from "./document";
import type { EditorDocument } from "./document";
import { editNotes } from "./noteEditing";
import type { NoteEdit } from "./noteEditing";

export type EditorCommand = NoteEdit
  | { type: "metadata"; title: string; artist: string; author: string; difficulty: string }
  | { type: "place"; id: string; laneIds: string[]; timeMs: number; endMs?: number; divisor: number }
  | { type: "delete-note"; id: string }
  | { type: "note-lanes"; id: string; laneIds: string[] }
  | { type: "tempo"; timeMs: number; bpm: number }
  | { type: "delete-tempo"; timeMs: number }
  | { type: "add-lane"; id: string; frame: LaneKeyframe }
  | { type: "delete-lane"; id: string }
  | { type: "motion"; frames: { laneId: string; frame: LaneKeyframe }[] }
  | { type: "easing"; laneIds: string[]; timeMs: number; easing: "smooth" | "linear" }
  | { type: "add-lanes"; lanes: { id: string; frame: LaneKeyframe }[] }
  | { type: "delete-motion"; laneIds: string[]; timeMs: number };
const precise = (ms: number) => Math.round(ms * 1000) / 1000;

export function editDocument(source: EditorDocument, command: EditorCommand): EditorDocument {
  const document = readDocument(source), chart = document.chart;
  switch (command.type) {
    case "edit-note": case "move-notes": case "snap-notes": case "delete-notes": case "assign-note-lanes": case "paste-notes":
      chart.notes = editNotes(chart, command); break;
    case "metadata":
      chart.title = command.title; chart.artist = command.artist; document.author = command.author; document.difficulty = command.difficulty; break;
    case "place": {
      if (!Number.isFinite(command.timeMs) || command.timeMs < 0 || command.endMs !== undefined && (!Number.isFinite(command.endMs) || command.endMs < 0)) throw new Error("Choose a valid note time.");
      const timeMs = precise(snapTime(chart.timing, command.timeMs, command.divisor));
      const endMs = command.endMs === undefined ? undefined : precise(snapTime(chart.timing, command.endMs, command.divisor));
      if (timeMs < 0 || timeMs > chart.durationMs - HIT_WINDOW_MS || endMs !== undefined && (endMs <= timeMs || endMs > chart.durationMs - HIT_WINDOW_MS)) {
        throw new Error("Keep notes inside the song and end holds after their start.");
      }
      const laneIds = [...new Set(command.laneIds)], existing = chart.notes.find(note => Math.abs(note.timeMs - timeMs) < .001);
      if (existing) {
        if ((existing.kind === "hold" ? existing.endMs : undefined) !== endMs) throw new Error("Shared circles must have the same note type and hold endpoint.");
        existing.laneIds = [...new Set([...existing.laneIds, ...laneIds])];
      } else {
        const note: ChartNote = endMs === undefined ? { id: command.id, kind: "tap", timeMs, laneIds } : { id: command.id, kind: "hold", timeMs, endMs, laneIds };
        chart.notes.push(note); chart.notes.sort((a, b) => a.timeMs - b.timeMs);
      }
      break;
    }
    case "delete-note": chart.notes = chart.notes.filter(note => note.id !== command.id); break;
    case "note-lanes": {
      const note = chart.notes.find(note => note.id === command.id); if (!note) throw new Error("Choose an existing note.");
      note.laneIds = [...new Set(command.laneIds)]; break;
    }
    case "tempo": {
      const timeMs = precise(command.timeMs);
      chart.timing = [...chart.timing.filter(point => point.timeMs !== timeMs), { timeMs, bpm: command.bpm }].sort((a, b) => a.timeMs - b.timeMs); break;
    }
    case "delete-tempo":
      if (command.timeMs === 0) throw new Error("The initial tempo is required.");
      chart.timing = chart.timing.filter(point => point.timeMs !== command.timeMs); break;
    case "add-lane":
      chart.lanes.push({ id: command.id, motion: [{ ...command.frame, timeMs: 0 }] }); break;
    case "add-lanes":
      chart.lanes.push(...command.lanes.map(({ id, frame }) => ({ id, motion: [{ ...frame, timeMs: 0 }] }))); break;
    case "delete-lane":
      if (chart.lanes.length === 1) throw new Error("Keep at least one line.");
      chart.lanes = chart.lanes.filter(lane => lane.id !== command.id);
      chart.notes = chart.notes.map(note => ({ ...note, laneIds: note.laneIds.filter(id => id !== command.id) })).filter(note => note.laneIds.length); break;
    case "motion":
      if (new Set(command.frames.map(item => item.laneId)).size !== command.frames.length) throw new Error("Each line can have only one keyframe at a time.");
      for (const { laneId, frame } of command.frames) {
        const lane = chart.lanes.find(lane => lane.id === laneId); if (!lane) throw new Error("Choose an existing line.");
        const timeMs = precise(frame.timeMs);
        lane.motion = [...lane.motion.filter(point => point.timeMs !== timeMs), { ...frame, timeMs }].sort((a, b) => a.timeMs - b.timeMs);
      } break;
    case "easing":
      if (!command.laneIds.length) throw new Error("Select lines with keyframes at this time.");
      for (const id of new Set(command.laneIds)) {
        const frame = chart.lanes.find(lane => lane.id === id)?.motion.find(frame => frame.timeMs === command.timeMs);
        if (!frame) throw new Error("Each selected line needs a keyframe at the playhead. Set a line or group keyframe first.");
        frame.easing = command.easing;
      } break;
    case "delete-motion":
      if (command.timeMs === 0) throw new Error("The opening line positions are required.");
      for (const lane of chart.lanes) if (command.laneIds.includes(lane.id)) lane.motion = lane.motion.filter(frame => frame.timeMs !== command.timeMs); break;
  }
  return readDocument(document);
}
