import { readDocument } from "../domain/document";
import type { EditorDocument } from "../domain/document";

export type SavedDraft = { id: string; document: EditorDocument; revision: number; updatedAt: number };
export type DraftSummary = { id: string; setId: string; title: string; artist: string; difficulty: string; notes: number; updatedAt: number };
const MAX_DOCUMENT = 4 * 1024 * 1024, MAX_LIBRARY = 512 * 1024 * 1024;
export class DraftConflict extends Error { constructor() { super("This draft changed in another window. Your edits are kept here; reopen the saved draft before editing further."); } }
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("notsu-editor", 1); let done = false;
    const fail = (error: unknown) => { if (!done) { done = true; clearTimeout(timer); reject(error); } };
    const timer = setTimeout(() => fail(new Error("Draft storage took too long to open.")), 5000);
    request.onupgradeneeded = () => {
      if (done) { request.transaction?.abort(); return; }
      request.result.createObjectStore("drafts", { keyPath: "id" });
      request.result.createObjectStore("songs", { keyPath: "hash" });
    };
    request.onerror = () => fail(request.error); request.onblocked = () => fail(new Error("Close other notsu windows to update draft storage."));
    request.onsuccess = () => { clearTimeout(timer); if (done) request.result.close(); else { done = true; resolve(request.result); } };
  });
}
async function transaction<T>(mode: IDBTransactionMode, work: (tx: IDBTransaction, result: (value: T) => void, fail: (error: Error) => void) => void): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = db.transaction(["drafts", "songs"], mode); } catch (error) { db.close(); reject(error); return; }
    let value: T, error: Error | null = null;
    const timer = setTimeout(() => { error = new Error("Draft storage timed out."); tx.abort(); }, 10000);
    const finish = () => { clearTimeout(timer); db.close(); };
    const fail = (cause: Error) => { error = cause; tx.abort(); };
    tx.oncomplete = () => { finish(); resolve(value); };
    tx.onabort = () => { finish(); reject(error ?? tx.error ?? new Error("Could not save locally. Check available storage.")); };
    try { work(tx, result => { value = result; }, fail); } catch (cause) { fail(cause instanceof Error ? cause : new Error("Draft storage failed.")); }
  });
}
function checked(document: EditorDocument) {
  const result = readDocument(document);
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_DOCUMENT) throw new Error("This draft exceeds the 4 MB chart limit.");
  return result;
}
const guarded = (fail: (error: Error) => void, operation: () => void) => () => {
  try { operation(); } catch (cause) { fail(cause instanceof Error ? cause : new Error("Draft storage failed.")); }
};
export async function createDraft(document: EditorDocument, bytes: ArrayBuffer): Promise<SavedDraft> {
  return (await createDrafts([document], bytes))[0];
}
/** Import a set atomically: a collision or capacity failure leaves every draft unchanged. */
export async function createDrafts(documents: EditorDocument[], bytes: ArrayBuffer): Promise<SavedDraft[]> {
  if (!documents.length || documents.length > 16) throw new Error("Import between 1 and 16 difficulties.");
  const docs = documents.map(checked), doc = docs[0];
  if (new Set(docs.map(d => d.id)).size !== docs.length || docs.some(d => d.setId !== doc.setId || d.song.sha256 !== doc.song.sha256 || d.song.size !== bytes.byteLength)) throw new Error("Recording size or difficulty identity does not match this map set.");
  return transaction("readwrite", (tx, result, fail) => {
    const drafts = tx.objectStore("drafts"), songs = tx.objectStore("songs");
    const count = drafts.count(); count.onsuccess = () => { if (count.result + docs.length > 50) fail(new Error("This device can keep up to 50 drafts.")); };
    for (const document of docs) {
      const existing = drafts.get(document.id); existing.onsuccess = () => { if (existing.result) fail(new Error("A difficulty from this set is already in your drafts. Open the saved draft to continue editing it.")); };
    }
    let total = 0, exists = false;
    const cursor = songs.openCursor(); cursor.onsuccess = guarded(fail, () => {
      const item = cursor.result;
      if (item) { total += item.value.blob.size; exists ||= item.key === doc.song.sha256; item.continue(); return; }
      if (!exists && total + bytes.byteLength > MAX_LIBRARY) { fail(new Error("The local song library has reached its 512 MB limit.")); return; }
      if (!exists) songs.add({ hash: doc.song.sha256, blob: new Blob([bytes], { type: doc.song.mime }) });
      const rows = docs.map(document => ({ id: document.id, document, revision: 1, updatedAt: Date.now() }));
      rows.forEach(row => drafts.add(row)); result(rows);
    });
  });
}
export const listDrafts = (): Promise<DraftSummary[]> => transaction("readonly", (tx, result) => {
  const summaries: DraftSummary[] = [], request = tx.objectStore("drafts").openCursor();
  request.onsuccess = () => {
    const item = request.result;
    if (!item) { result(summaries.sort((a, b) => b.updatedAt - a.updatedAt)); return; }
    try {
      const row = item.value as SavedDraft, doc = readDocument(row.document);
      summaries.push({ id: doc.id, setId: doc.setId, title: doc.chart.title, artist: doc.chart.artist, difficulty: doc.difficulty, notes: doc.chart.notes.length, updatedAt: row.updatedAt });
    } catch { summaries.push({ id: String(item.key), setId: "", title: "Unreadable draft", artist: "Recovery required", difficulty: "", notes: 0, updatedAt: 0 }); }
    item.continue();
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
      const row = request.result as SavedDraft;
      if (row.id !== id || row.document?.id !== id || !Number.isSafeInteger(row.revision) || row.revision < 1) throw new Error("Invalid saved draft revision.");
      row.document = checked(row.document);
      const song = tx.objectStore("songs").get(row.document.song.sha256);
      song.onsuccess = () => {
        if (!(song.result?.blob instanceof Blob) || song.result.blob.size !== row.document.song.size) { fail(new Error("The saved recording is missing or damaged.")); return; }
        result({ row, blob: song.result.blob });
      };
    } catch (cause) { fail(cause instanceof Error ? cause : new Error("Invalid saved draft.")); }
  };
});
export async function saveDraft(document: EditorDocument, revision: number): Promise<SavedDraft> {
  const doc = checked(document);
  return transaction("readwrite", (tx, result, fail) => {
    const store = tx.objectStore("drafts"), request = store.get(doc.id);
    request.onsuccess = guarded(fail, () => {
      if (!request.result || request.result.revision !== revision) { fail(new DraftConflict()); return; }
      if (request.result.document.song.sha256 !== doc.song.sha256) { fail(new Error("A draft's recording cannot change.")); return; }
      const row = { id: doc.id, document: doc, revision: revision + 1, updatedAt: Date.now() }; store.put(row); result(row);
    });
  });
}
