import { loadChart } from "../../rhythm/domain/chart";
import type { Chart } from "../../rhythm/domain/chart";
import { songReference } from "../../../shared/domain/song";
import type { SongReference } from "../../../shared/domain/song";
export type { SongReference } from "../../../shared/domain/song";

export type EditorDocument = {
  format: "notsu-draft"; version: 1; id: string; setId: string; author: string; difficulty: string;
  song: SongReference; chart: Chart;
};
const label = (value: unknown, name: string): string => {
  if (typeof value !== "string" || !value.trim() || value.length > 256 || /[\x00-\x1f\x7f]/.test(value)) throw new Error(`Enter a valid ${name}.`);
  return value.trim();
};
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid editor document.");
  return value as Record<string, unknown>;
};

/** Drafts may be empty. Playable charts still require at least one logical note. */
export function readDocument(value: unknown): EditorDocument {
  const raw = object(value), audio = songReference(raw.song);
  if (raw.format !== "notsu-draft" || raw.version !== 1) throw new Error("Unsupported editor document.");
  const id = label(raw.id, "document ID");
  const chart = loadChart(raw.chart, { allowEmptyNotes: true });
  chart.title = label(chart.title, "song title"); chart.artist = label(chart.artist, "artist");
  if (chart.id !== id || chart.audioSha256 !== audio.sha256 || chart.audioOffsetMs + chart.durationMs > audio.durationMs + .001) {
    throw new Error("The chart does not match its song or exceeds its duration.");
  }
  return { format: "notsu-draft", version: 1, id, setId: label(raw.setId ?? id, "map set ID"), author: label(raw.author, "mapper name"), difficulty: label(raw.difficulty, "difficulty name"), song: audio, chart };
}

export function createDocument(id: string, song: SongReference, title: string): EditorDocument {
  return readDocument({ format: "notsu-draft", version: 1, id, author: "Guest", difficulty: "Untitled difficulty", song,
    chart: { version: 2, id, title, artist: "Unknown artist", durationMs: Math.floor(song.durationMs), audioOffsetMs: 0, audioSha256: song.sha256,
      timing: [{ timeMs: 0, bpm: 120 }], notes: [], lanes: [{ id: "line-1", motion: [{ timeMs: 0, x: .28, y: .5, angle: 0, length: 360 }] }] } });
}
export function playableChart(document: EditorDocument): Chart { return loadChart(readDocument(document).chart); }

/** Restore against measured media metadata, never against size/duration claimed by a backup. */
export function restoreDocument(id: string, value: EditorDocument, song: SongReference): EditorDocument {
  const source = readDocument(value);
  if (source.song.sha256 !== song.sha256) throw new Error("This backup needs its original song file. The selected recording does not match.");
  return readDocument({ ...source, id, song, chart: { ...source.chart, id } });
}
