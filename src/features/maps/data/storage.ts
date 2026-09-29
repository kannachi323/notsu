import { readMapSet } from "../domain/mapSet";
import type { LoadedMap } from "./package";
import { MAX_MAP_BYTES } from "./package";

export type MapSummary = {
  revision: string; setId: string; title: string; artist: string; author: string; importedAt: number; favorite: boolean;
  difficulties: { id: string; name: string; author: string; notes: number; lanes: number; durationMs: number }[];
};
export type StoredMap = MapSummary & { archive: Blob };
const MAX_LIBRARY = 1024 * 1024 * 1024, MAX_REVISIONS = 200;
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("notsu-maps", 1); let done = false;
    const fail = (cause: unknown) => { if (!done) { done = true; clearTimeout(timer); reject(cause); } };
    const timer = setTimeout(() => fail(new Error("Map storage took too long to open.")), 5000);
    request.onupgradeneeded = () => { if (done) request.transaction?.abort(); else request.result.createObjectStore("maps", { keyPath: "revision" }); };
    request.onerror = () => fail(request.error); request.onblocked = () => fail(new Error("Close other notsu windows to update the map library."));
    request.onsuccess = () => { clearTimeout(timer); if (done) request.result.close(); else { done = true; resolve(request.result); } };
  });
}
async function transaction<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore, result: (value: T) => void, guard: (operation: () => void) => () => void) => void): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = db.transaction("maps", mode); } catch (cause) { db.close(); reject(cause); return; }
    let value: T, error: unknown;
    const guard = (operation: () => void) => () => { try { operation(); } catch (cause) { error = cause; tx.abort(); } };
    const timer = setTimeout(() => { error = new Error("Map storage timed out."); tx.abort(); }, 10000);
    const finish = () => { clearTimeout(timer); db.close(); };
    tx.oncomplete = () => { finish(); resolve(value); };
    tx.onabort = () => { finish(); reject(error ?? tx.error ?? new Error("Map storage is unavailable.")); };
    guard(() => work(tx.objectStore("maps"), result => { value = result; }, guard))();
  });
}
function checked(value: unknown): StoredMap {
  const row = value as StoredMap;
  if (!row || !/^[a-f0-9]{64}$/.test(row.revision) || !row.setId || typeof row.title !== "string" || typeof row.artist !== "string" || typeof row.author !== "string" ||
      !Number.isFinite(row.importedAt) || typeof row.favorite !== "boolean" || !Array.isArray(row.difficulties) || !row.difficulties.length || row.difficulties.length > 16 ||
      !(row.archive instanceof Blob) || row.archive.size < 22 || row.archive.size > MAX_MAP_BYTES) throw new Error("This saved map is damaged. Import its package again.");
  for (const difficulty of row.difficulties) {
    if (!difficulty || typeof difficulty.id !== "string" || typeof difficulty.name !== "string" || typeof difficulty.author !== "string" ||
        !Number.isSafeInteger(difficulty.notes) || difficulty.notes < 0 || !Number.isFinite(difficulty.durationMs) || !Number.isSafeInteger(difficulty.lanes)) throw new Error("This saved map has damaged difficulty metadata.");
  }
  return row;
}
export function storeMap(loaded: LoadedMap, bytes: Uint8Array): Promise<StoredMap> {
  const set = readMapSet(loaded.set);
  const row: StoredMap = checked({ revision: loaded.revision, setId: set.id, title: set.title, artist: set.artist, author: set.author, importedAt: Date.now(), favorite: false,
    difficulties: set.difficulties.map(({ name, author, chart }) => ({ id: chart.id, name, author, notes: chart.notes.length, lanes: chart.lanes.length, durationMs: chart.durationMs })),
    archive: new Blob([new Uint8Array(bytes)], { type: "application/zip" }) });
  return restoreMap(row);
}
/** Reimports repair package bytes while retaining preferences for identical content. */
export function restoreMap(source: StoredMap): Promise<StoredMap> {
  const row = checked(source);
  return transaction("readwrite", (store, result, guard) => {
    let count = 0, total = 0, oldSize = 0, present = false, existing: StoredMap | undefined;
    const cursor = store.openCursor(); cursor.onsuccess = guard(() => {
      const item = cursor.result;
      if (item) {
        count++; const size = item.value.archive instanceof Blob ? item.value.archive.size : 0; total += size;
        if (item.key === row.revision) { present = true; oldSize = size; try { existing = checked(item.value); } catch { /* A verified reimport repairs this record. */ } }
        item.continue(); return;
      }
      if ((!present && count >= MAX_REVISIONS) || total - oldSize + row.archive.size > MAX_LIBRARY) throw new Error("The local map library is full (200 revisions or 1 GB). Remove a map before importing another.");
      const next = existing ? { ...row, favorite: existing.favorite, importedAt: existing.importedAt } : row;
      store.put(next); result(next);
    });
  });
}
export const listMaps = (): Promise<{ maps: MapSummary[]; unreadable: number }> => transaction("readonly", (store, result, guard) => {
  const maps: MapSummary[] = []; let unreadable = 0; const cursor = store.openCursor();
  cursor.onsuccess = guard(() => {
    const item = cursor.result;
    if (!item) { result({ maps: maps.sort((a, b) => b.importedAt - a.importedAt), unreadable }); return; }
    try { const { archive: _, ...summary } = checked(item.value); maps.push(summary); } catch { unreadable++; }
    item.continue();
  });
});
export const readMap = (revision: string): Promise<StoredMap> => transaction("readonly", (store, result, guard) => {
  const request = store.get(revision); request.onsuccess = guard(() => { if (!request.result) throw new Error("This map is no longer on this device."); result(checked(request.result)); });
});
export const favoriteMap = (revision: string, favorite: boolean): Promise<void> => transaction("readwrite", (store, result, guard) => {
  const request = store.get(revision); request.onsuccess = guard(() => {
    if (!request.result) throw new Error("This map is no longer on this device.");
    store.put({ ...checked(request.result), favorite }); result();
  });
});
export const removeMap = (revision: string): Promise<StoredMap> => transaction("readwrite", (store, result, guard) => {
  const request = store.get(revision); request.onsuccess = guard(() => {
    if (!request.result) throw new Error("This map is no longer on this device.");
    const row = checked(request.result); store.delete(revision); result(row);
  });
});
