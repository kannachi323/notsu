import { readDocument } from "../domain/document";
import type { EditorDocument } from "../domain/document";
import { readMapSet } from "../../maps/domain/mapSet";
import type { MapSet } from "../../maps/domain/mapSet";
export function mapSetDrafts(value: MapSet): EditorDocument[] {
  const set = readMapSet(value);
  return set.difficulties.map(difficulty => readDocument({ format: "notsu-draft", version: 1, id: difficulty.chart.id, setId: set.id,
    author: difficulty.author, difficulty: difficulty.name, song: set.song, chart: difficulty.chart }));
}
export function draftMapSet(primary: EditorDocument, documents: EditorDocument[]) {
  const active = readDocument(primary);
  const drafts = documents.filter(doc => doc.id !== active.id).concat(active).map(readDocument);
  if (drafts.some(doc => doc.setId !== active.setId || doc.song.sha256 !== active.song.sha256)) throw new Error("Only difficulties from the same map set and recording can be packaged together.");
  return readMapSet({ format: "notsu-map", version: 1, id: active.setId, title: active.chart.title, artist: active.chart.artist, author: active.author, song: active.song,
    difficulties: drafts.map(doc => ({ name: doc.difficulty, author: doc.author, chart: doc.chart })) });
}
