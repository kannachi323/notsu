import { checked, guarded, transaction } from "./database";
import type { EditorDocument } from "../domain/document";

export type DraftVersion = { revision: number; incarnation?: string };
export type SavedDraft = DraftVersion & { id: string; document: EditorDocument; updatedAt: number };
export type DraftSummary = { id: string; setId: string; title: string; artist: string; difficulty: string; notes: number; updatedAt: number; version: DraftVersion | null };
const MAX_LIBRARY = 512 * 1024 * 1024;
export class DraftConflict extends Error { constructor() { super("This draft changed or moved in another window. Your edits are still here. Save a recovery copy to keep both versions."); } }
export async function createDraft(document: EditorDocument, bytes: ArrayBuffer): Promise<SavedDraft> {
  return (await createDrafts([document], bytes))[0];
}
/** Import a set atomically: a collision or capacity failure leaves every draft unchanged. */
export async function createDrafts(documents: EditorDocument[], bytes: ArrayBuffer): Promise<SavedDraft[]> {
  if (!documents.length || documents.length > 16) throw new Error("Import between 1 and 16 difficulties.");
  const docs = documents.map(checked), doc = docs[0];
  if (new Set(docs.map(d => d.id)).size !== docs.length || docs.some(d => d.setId !== doc.setId || d.song.sha256 !== doc.song.sha256 || d.song.size !== bytes.byteLength)) throw new Error("Recording size or difficulty identity does not match this map set.");
  return transaction("readwrite", (tx, result, fail) => {
    const drafts = tx.objectStore("drafts"), songs = tx.objectStore("songs"), trash = tx.objectStore("trash");
    const count = drafts.count(), trashed = trash.count();
    trashed.onsuccess = () => { if (count.result + trashed.result + docs.length > 50) fail(new Error("This device can keep up to 50 drafts, including Trash. Permanently remove unwanted drafts from Trash to make room.")); };
    for (const document of docs) {
      for (const store of [drafts, trash]) {
        const existing = store.get(document.id); existing.onsuccess = () => { if (existing.result) fail(new Error("A difficulty from this set is already in your drafts or Trash. Open or restore it to continue editing.")); };
      }
    }
    let total = 0, exists = false;
    const cursor = songs.openCursor(); cursor.onsuccess = guarded(fail, () => {
      const item = cursor.result;
      if (item) { total += item.value.blob.size; exists ||= item.key === doc.song.sha256; item.continue(); return; }
      if (!exists && total + bytes.byteLength > MAX_LIBRARY) { fail(new Error("The local song library has reached its 512 MB limit.")); return; }
      if (!exists) songs.add({ hash: doc.song.sha256, blob: new Blob([bytes], { type: doc.song.mime }) });
      const rows = docs.map(document => ({ id: document.id, document, revision: 1, incarnation: crypto.randomUUID(), updatedAt: Date.now() }));
      rows.forEach(row => drafts.add(row)); result(rows);
    });
  });
}
export function savedRow(value: unknown, id: string): SavedDraft {
  const row = value as SavedDraft | undefined;
  if (!row || row.id !== id || row.document?.id !== id || !Number.isSafeInteger(row.revision) || row.revision < 1 ||
    (row.incarnation !== undefined && (typeof row.incarnation !== "string" || !row.incarnation))) throw new Error("Invalid saved draft revision.");
  return { ...row, document: checked(row.document) };
}
export const sameVersion = (row: DraftVersion, expected: DraftVersion) => row.revision === expected.revision && row.incarnation === expected.incarnation;
export function summarize(value: unknown, id: string): DraftSummary {
  try {
    const row = savedRow(value, id), doc = row.document;
    return { id, setId: doc.setId, title: doc.chart.title, artist: doc.chart.artist, difficulty: doc.difficulty,
      notes: doc.chart.notes.length, updatedAt: row.updatedAt, version: { revision: row.revision, incarnation: row.incarnation } };
  } catch { return { id, setId: "", title: "Unreadable draft", artist: "Recovery required", difficulty: "", notes: 0, updatedAt: 0, version: null }; }
}
export const listDrafts = (): Promise<DraftSummary[]> => transaction("readonly", (tx, result) => {
  const summaries: DraftSummary[] = [], request = tx.objectStore("drafts").openCursor();
  request.onsuccess = () => {
    const item = request.result;
    if (!item) { result(summaries.sort((a, b) => b.updatedAt - a.updatedAt)); return; }
    summaries.push(summarize(item.value, String(item.key))); item.continue();
  };
});
/** One transaction gives package export a consistent snapshot of saved difficulties. */
export const readSetDrafts = (setId: string): Promise<EditorDocument[]> => transaction("readonly", (tx, result, fail) => {
  const documents: EditorDocument[] = [], request = tx.objectStore("drafts").openCursor();
  request.onsuccess = guarded(fail, () => {
    const item = request.result;
    if (!item) { result(documents); return; }
    const raw = item.value.document;
    if ((raw?.setId ?? raw?.id) === setId) documents.push(checked(raw));
    item.continue();
  });
});
export const readDraft = (id: string): Promise<{ row: SavedDraft; blob: Blob }> => transaction("readonly", (tx, result, fail) => {
  const request = tx.objectStore("drafts").get(id);
  request.onsuccess = () => {
    try {
      if (!request.result) throw new Error("This draft is no longer available.");
      const row = savedRow(request.result, id);
      const song = tx.objectStore("songs").get(row.document.song.sha256);
      song.onsuccess = () => {
        if (!(song.result?.blob instanceof Blob) || song.result.blob.size !== row.document.song.size) { fail(new Error("The saved recording is missing or damaged.")); return; }
        result({ row, blob: song.result.blob });
      };
    } catch (cause) { fail(cause instanceof Error ? cause : new Error("Invalid saved draft.")); }
  };
});
export async function saveDraft(document: EditorDocument, version: DraftVersion): Promise<SavedDraft> {
  const doc = checked(document);
  return transaction("readwrite", (tx, result, fail) => {
    const store = tx.objectStore("drafts"), request = store.get(doc.id);
    request.onsuccess = guarded(fail, () => {
      if (!request.result || !sameVersion(request.result, version)) { fail(new DraftConflict()); return; }
      if (request.result.document.song.sha256 !== doc.song.sha256) { fail(new Error("A draft's recording cannot change.")); return; }
      const row = { id: doc.id, document: doc, revision: version.revision + 1, incarnation: version.incarnation, updatedAt: Date.now() }; store.put(row); result(row);
    });
  });
}
