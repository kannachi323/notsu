import { loadChart } from "../../rhythm/domain/chart";
import type { Chart } from "../../rhythm/domain/chart";
import { songReference } from "../../../shared/domain/song";
import type { SongReference } from "../../../shared/domain/song";

export type Difficulty = { name: string; author: string; chart: Chart };
export type MapSet = {
  format: "notsu-map"; version: 1; id: string; title: string; artist: string; author: string;
  song: SongReference; difficulties: Difficulty[];
};
export function mapObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid map package metadata.");
  return value as Record<string, unknown>;
}
function label(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256 || /[\x00-\x1f\x7f]/.test(value)) throw new Error("Map names must be readable text, up to 256 characters.");
  return value.trim();
}
/** Explicit fields strip unknown data and give revisions a stable serialized form. */
function canonicalChart(value: unknown): Chart {
  const chart = loadChart(value, { allowEmptyNotes: true });
  return {
    version: 2, id: label(chart.id), title: label(chart.title), artist: label(chart.artist),
    durationMs: chart.durationMs, audioOffsetMs: chart.audioOffsetMs, audioSha256: chart.audioSha256,
    timing: chart.timing.map(({ timeMs, bpm }) => ({ timeMs, bpm })),
    lanes: chart.lanes.map(lane => ({ id: lane.id, motion: lane.motion.map(frame => ({
      timeMs: frame.timeMs, x: frame.x, y: frame.y, angle: frame.angle, length: frame.length, easing: frame.easing ?? "smooth",
    })) })),
    notes: chart.notes.map(note => ({ id: note.id, kind: note.kind, timeMs: note.timeMs,
      ...(note.kind === "hold" ? { endMs: note.endMs } : {}), laneIds: [...note.laneIds] })) as Chart["notes"],
  };
}
export function readMapSet(value: unknown): MapSet {
  const raw = mapObject(value);
  if (raw.format !== "notsu-map" || raw.version !== 1) throw new Error("Unsupported map package version.");
  const song = songReference(raw.song);
  if (!Array.isArray(raw.difficulties) || !raw.difficulties.length || raw.difficulties.length > 16) throw new Error("A map set needs between 1 and 16 difficulties.");
  const ids = new Set<string>(), names = new Set<string>();
  const difficulties = raw.difficulties.map(value => {
    const entry = mapObject(value), chart = canonicalChart(entry.chart), name = label(entry.name), author = label(entry.author);
    if (ids.has(chart.id) || names.has(name.toLowerCase())) throw new Error("Give each difficulty a unique ID and name.");
    ids.add(chart.id); names.add(name.toLowerCase());
    if (chart.audioSha256 !== song.sha256 || chart.audioOffsetMs + chart.durationMs > song.durationMs + .001) throw new Error("A difficulty does not match the packaged recording or exceeds its duration.");
    return { name, author, chart };
  }).sort((a, b) => a.chart.id < b.chart.id ? -1 : a.chart.id > b.chart.id ? 1 : 0);
  return { format: "notsu-map", version: 1, id: label(raw.id), title: label(raw.title), artist: label(raw.artist), author: label(raw.author), song, difficulties };
}
