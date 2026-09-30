import type { Chart, ChartNote } from "../../rhythm/domain/chart";
import { beatAtTime, snapTime, timeAtBeat } from "../../rhythm/domain/timing";
import { HIT_WINDOW_MS } from "../../rhythm/domain/rules";

export type NotePhrase = { beat: number; endBeat?: number; laneIds: string[] }[];
export type NoteEdit =
  | { type: "edit-note"; id: string; timeMs: number; endMs?: number; laneIds: string[] }
  | { type: "move-notes"; ids: string[]; amount: number; unit: "ms" | "beats" }
  | { type: "snap-notes"; ids: string[]; divisor: number }
  | { type: "delete-notes"; ids: string[] }
  | { type: "assign-note-lanes"; ids: string[]; laneIds: string[] }
  | { type: "paste-notes"; phrase: NotePhrase; ids: string[]; timeMs: number; divisor: number };
const precise = (ms: number) => Math.round(ms * 1000) / 1000;

function selection(chart: Chart, ids: string[]): ChartNote[] {
  const wanted = new Set(ids), found = chart.notes.filter(note => wanted.has(note.id));
  if (!wanted.size || found.length !== wanted.size) throw new Error("Select existing circles first.");
  return found;
}

/** Copy musical offsets, so a phrase follows the destination's tempo changes. */
export function copyPhrase(chart: Chart, ids: string[]): NotePhrase {
  const notes = selection(chart, ids), origin = beatAtTime(chart.timing, notes[0].timeMs);
  return notes.map(note => ({ beat: beatAtTime(chart.timing, note.timeMs) - origin,
    ...(note.kind === "hold" ? { endBeat: beatAtTime(chart.timing, note.endMs) - origin } : {}), laneIds: [...note.laneIds] }));
}

/** Returns new notes; final chart validation belongs to the atomic editor command. */
export function editNotes(chart: Chart, command: NoteEdit): ChartNote[] {
  const selected = command.type === "paste-notes" ? [] : selection(chart, command.type === "edit-note" ? [command.id] : command.ids);
  const wanted = new Set(selected.map(note => note.id));
  const retime = (note: ChartNote, transform: (ms: number) => number): ChartNote => note.kind === "hold"
    ? { ...note, timeMs: precise(transform(note.timeMs)), endMs: precise(transform(note.endMs)) }
    : { ...note, timeMs: precise(transform(note.timeMs)) };
  let notes: ChartNote[];
  switch (command.type) {
    case "delete-notes": return chart.notes.filter(note => !wanted.has(note.id));
    case "edit-note": {
      const note: ChartNote = command.endMs === undefined
        ? { id: command.id, kind: "tap", timeMs: precise(command.timeMs), laneIds: [...new Set(command.laneIds)] }
        : { id: command.id, kind: "hold", timeMs: precise(command.timeMs), endMs: precise(command.endMs), laneIds: [...new Set(command.laneIds)] };
      notes = chart.notes.map(old => old.id === note.id ? note : old); break;
    }
    case "assign-note-lanes":
      notes = chart.notes.map(note => wanted.has(note.id) ? { ...note, laneIds: [...new Set(command.laneIds)] } : note); break;
    case "move-notes": {
      if (!Number.isFinite(command.amount)) throw new Error("Enter a finite timing adjustment.");
      const move = command.unit === "ms" ? (ms: number) => ms + command.amount
        : (ms: number) => timeAtBeat(chart.timing, beatAtTime(chart.timing, ms) + command.amount);
      notes = chart.notes.map(note => wanted.has(note.id) ? retime(note, move) : note); break;
    }
    case "snap-notes":
      notes = chart.notes.map(note => wanted.has(note.id) ? retime(note, ms => snapTime(chart.timing, ms, command.divisor)) : note); break;
    case "paste-notes": {
      if (!command.phrase.length || command.phrase.length !== command.ids.length || !Number.isFinite(command.timeMs) || command.timeMs < 0) throw new Error("Choose a copied phrase and a valid paste position.");
      const anchor = beatAtTime(chart.timing, snapTime(chart.timing, command.timeMs, command.divisor));
      const added: ChartNote[] = command.phrase.map((note, index) => {
        if (!Number.isFinite(note.beat) || note.beat < 0 || note.endBeat !== undefined && (!Number.isFinite(note.endBeat) || note.endBeat <= note.beat)) throw new Error("The copied phrase has invalid beat positions.");
        const timeMs = precise(timeAtBeat(chart.timing, anchor + note.beat)), laneIds = [...new Set(note.laneIds)];
        return note.endBeat === undefined ? { id: command.ids[index], kind: "tap", timeMs, laneIds }
          : { id: command.ids[index], kind: "hold", timeMs, endMs: precise(timeAtBeat(chart.timing, anchor + note.endBeat)), laneIds };
      });
      notes = [...chart.notes, ...added]; break;
    }
  }
  notes.sort((a, b) => a.timeMs - b.timeMs);
  const lanes = new Set(chart.lanes.map(lane => lane.id));
  for (let i = 0; i < notes.length; i++) {
    const note = notes[i];
    if (!Number.isFinite(note.timeMs) || note.timeMs < 0 || note.timeMs > chart.durationMs - HIT_WINDOW_MS ||
      note.kind === "hold" && (!Number.isFinite(note.endMs) || note.endMs <= note.timeMs || note.endMs > chart.durationMs - HIT_WINDOW_MS)) throw new Error("Keep circles inside the song and hold ends after their starts.");
    if (!note.laneIds.length || note.laneIds.some(id => !lanes.has(id))) throw new Error("Every circle needs at least one existing line. Recopy phrases after removing their lines.");
    if (i && note.timeMs - notes[i - 1].timeMs < .001) throw new Error("This edit puts two circles at the same time. Move them apart, or use shared lines on one circle.");
  }
  return notes;
}
