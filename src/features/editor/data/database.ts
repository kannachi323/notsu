import { readDocument } from "../domain/document";
import type { EditorDocument } from "../domain/document";
const MAX_DOCUMENT = 4 * 1024 * 1024;
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("notsu-editor", 2); let done = false;
    const fail = (error: unknown) => { if (!done) { done = true; clearTimeout(timer); reject(error); } };
    const timer = setTimeout(() => fail(new Error("Draft storage took too long to open.")), 5000);
    request.onupgradeneeded = () => {
      if (done) { request.transaction?.abort(); return; }
      for (const [name, keyPath] of [["drafts", "id"], ["songs", "hash"], ["trash", "id"]]) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, { keyPath });
      }
    };
    request.onerror = () => fail(request.error); request.onblocked = () => fail(new Error("Close other notsu windows to update draft storage."));
    request.onsuccess = () => { clearTimeout(timer); if (done) request.result.close(); else { done = true; request.result.onversionchange = () => request.result.close(); resolve(request.result); } };
  });
}
export async function transaction<T>(mode: IDBTransactionMode, work: (tx: IDBTransaction, result: (value: T) => void, fail: (error: Error) => void) => void): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = db.transaction(["drafts", "songs", "trash"], mode); } catch (error) { db.close(); reject(error); return; }
    let value: T, error: Error | null = null;
    const timer = setTimeout(() => { error = new Error("Draft storage timed out."); tx.abort(); }, 10000);
    const finish = () => { clearTimeout(timer); db.close(); };
    const fail = (cause: Error) => { error = cause; tx.abort(); };
    tx.oncomplete = () => { finish(); resolve(value); };
    tx.onabort = () => { finish(); reject(error ?? tx.error ?? new Error("Could not save locally. Check available storage.")); };
    try { work(tx, result => { value = result; }, fail); } catch (cause) { fail(cause instanceof Error ? cause : new Error("Draft storage failed.")); }
  });
}
export function checked(document: EditorDocument) {
  const result = readDocument(document);
  if (new TextEncoder().encode(JSON.stringify(result)).length > MAX_DOCUMENT) throw new Error("This draft exceeds the 4 MB chart limit.");
  return result;
}
export const guarded = (fail: (error: Error) => void, operation: () => void) => () => {
  try { operation(); } catch (cause) { fail(cause instanceof Error ? cause : new Error("Draft storage failed.")); }
};
