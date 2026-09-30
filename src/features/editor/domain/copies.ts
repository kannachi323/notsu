import { readDocument } from "./document";
import type { EditorDocument } from "./document";

/** Recovery gets a separate set identity so a stale window cannot overwrite the saved version or its siblings. */
export function recoveryCopy(document: EditorDocument, id: string): EditorDocument {
  return readDocument({ ...document, id, setId: id, chart: { ...document.chart, id } });
}
export function difficultyCopy(document: EditorDocument, id: string, siblings: EditorDocument[]): EditorDocument {
  if (siblings.length >= 16) throw new Error("A map set supports up to 16 difficulties. Export or remove an unwanted difficulty before adding another.");
  const names = new Set(siblings.map(doc => doc.difficulty.toLowerCase()));
  const base = `${document.difficulty.slice(0, 230)} copy`;
  let difficulty = base, suffix = 2;
  while (names.has(difficulty.toLowerCase())) difficulty = `${base} ${suffix++}`;
  return readDocument({ ...document, id, difficulty, chart: { ...document.chart, id } });
}
