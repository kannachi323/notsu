import { bestRecord, comparePerformance, isPersonalBestCandidate, MAX_REPLAY_BYTES, readRecord, recordGroup } from "../domain/records";
import type { LocalRecord, SavedPerformance, SaveOutcome, SaveResult } from "../domain/records";

export type RemovedRecord = { record: LocalRecord; blob: Blob | null };
export const RECORDS_CHANGED = "notsu-records-changed";
const MAX_RECORDS = 1000, MAX_LIBRARY_BYTES = 128 * 1024 * 1024;
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("notsu-records", 1); let done = false;
    const fail = (cause: unknown) => { if (!done) { done = true; clearTimeout(timer); reject(cause); } };
    const timer = setTimeout(() => fail(new Error("Record storage took too long to open.")), 5000);
    request.onupgradeneeded = () => {
      if (done) { request.transaction?.abort(); return; }
      request.result.createObjectStore("records", { keyPath: "id" }).createIndex("map", ["revision", "chartId", "rulesVersion"]);
      request.result.createObjectStore("replays", { keyPath: "id" });
    };
    request.onerror = () => fail(request.error); request.onblocked = () => fail(new Error("Close other notsu windows to update record storage."));
    request.onsuccess = () => { clearTimeout(timer); if (done) request.result.close(); else { done = true; request.result.onversionchange = () => request.result.close(); resolve(request.result); } };
  });
}
async function transaction<T>(mode: IDBTransactionMode, work: (tx: IDBTransaction, result: (value: T) => void, guard: (operation: () => void) => () => void) => void): Promise<T> {
  const db = await open();
  return new Promise((resolve, reject) => {
    let tx: IDBTransaction;
    try { tx = db.transaction(["records", "replays"], mode); } catch (cause) { db.close(); reject(cause); return; }
    let value: T, error: unknown;
    const finish = () => { clearTimeout(timer); db.close(); };
    const guard = (operation: () => void) => () => { try { operation(); } catch (cause) { error = cause; tx.abort(); } };
    const timer = setTimeout(() => { error = new Error("Record storage timed out."); tx.abort(); }, 10000);
    tx.oncomplete = () => { finish(); resolve(value); };
    tx.onabort = () => { finish(); reject(error ?? tx.error ?? new Error("Records could not be saved on this device.")); };
    guard(() => work(tx, next => { value = next; }, guard))();
  });
}
function changed() { if (typeof window !== "undefined") window.dispatchEvent(new Event(RECORDS_CHANGED)); }
export async function storeRecord(performance: SavedPerformance): Promise<SaveResult> {
  const row = readRecord(performance.record), json = JSON.stringify(performance.replay), blob = new Blob([json], { type: "application/json" });
  if (blob.size !== row.replayBytes || blob.size > MAX_REPLAY_BYTES || performance.replay.chartId !== row.chartId || performance.replay.chartHash !== row.chartHash || performance.replay.rulesVersion !== row.rulesVersion) throw new Error("The record and replay do not match.");
  return storeBlob(row, blob, true);
}
async function storeBlob(row: LocalRecord, blob: Blob | null, repair: boolean): Promise<SaveResult> {
  const saved = await transaction<SaveResult>("readwrite", (tx, result, guard) => {
    const records = tx.objectStore("records"), replays = tx.objectStore("replays"), existing = records.get(row.id);
    existing.onsuccess = guard(() => {
      if (existing.result) {
        if (JSON.stringify(readRecord(existing.result)) !== JSON.stringify(row)) throw new Error("This attempt ID is already used by another result.");
        if (repair && blob) replays.put({ id: row.id, blob }); result({ record: row, outcome: "already-saved" }); return;
      }
      const count = records.count();
      count.onsuccess = guard(() => { if (count.result >= MAX_RECORDS) throw new Error("Your record library has reached 1,000 attempts. Remove an unwanted attempt from Recent attempts before retrying the save."); });
      let total = 0;
      const cursor = replays.openCursor(); cursor.onsuccess = guard(() => {
        const item = cursor.result;
        if (item) { total += item.value.blob instanceof Blob ? item.value.blob.size : MAX_LIBRARY_BYTES; item.continue(); return; }
        if (total + (blob?.size ?? 0) > MAX_LIBRARY_BYTES) throw new Error("Your replay library has reached 128 MB. Remove an unwanted attempt before retrying the save.");
        const request = records.index("map").getAll(recordGroup(row.revision, row.chartId));
        request.onsuccess = guard(() => {
          const candidates: LocalRecord[] = [];
          for (const value of request.result) { try { candidates.push(readRecord(value)); } catch { /* Damaged metadata cannot set a personal best. */ } }
          const best = bestRecord(candidates);
          let outcome: SaveOutcome = row.summary.status === "failed" ? "failed" : "practice";
          if (isPersonalBestCandidate(row)) outcome = !best ? "first" : comparePerformance(row.summary, best.summary) > 0 ? "improved" : comparePerformance(row.summary, best.summary) === 0 ? "tied" : "unchanged";
          records.add(row); if (blob) replays.add({ id: row.id, blob }); result({ record: row, outcome });
        });
      });
    });
  });
  changed(); return saved;
}
export const listRecords = (revision: string, chartId: string): Promise<{ records: LocalRecord[]; unreadable: number }> => transaction("readonly", (tx, result, guard) => {
  const request = tx.objectStore("records").index("map").getAll(recordGroup(revision, chartId));
  request.onsuccess = guard(() => {
    const records: LocalRecord[] = []; let unreadable = 0;
    for (const row of request.result) { try { records.push(readRecord(row)); } catch { unreadable++; } }
    result({ records: records.sort((a, b) => b.finishedAt - a.finishedAt || a.id.localeCompare(b.id)), unreadable });
  });
});
export async function readPerformance(id: string): Promise<SavedPerformance> {
  const saved = await transaction<{ record: LocalRecord; blob: Blob }>("readonly", (tx, result, guard) => {
    const record = tx.objectStore("records").get(id), replay = tx.objectStore("replays").get(id);
    replay.onsuccess = guard(() => {
      if (!record.result) throw new Error("This attempt is no longer saved.");
      const row = readRecord(record.result), blob = replay.result?.blob;
      if (!(blob instanceof Blob) || blob.size !== row.replayBytes || blob.size > MAX_REPLAY_BYTES) throw new Error("This saved replay is missing or damaged.");
      result({ record: row, blob });
    });
  });
  return { record: saved.record, replay: JSON.parse(await saved.blob.text()) };
}
/** Keep the original Blob for Undo, even when its JSON is damaged or missing. */
export async function removeRecord(id: string): Promise<RemovedRecord> {
  const removed = await transaction<RemovedRecord>("readwrite", (tx, result, guard) => {
    const records = tx.objectStore("records"), replays = tx.objectStore("replays");
    const record = records.get(id), replay = replays.get(id);
    replay.onsuccess = guard(() => {
      if (!record.result) throw new Error("This attempt is no longer saved. Refresh the list.");
      const row = readRecord(record.result), blob = replay.result?.blob;
      records.delete(id); replays.delete(id); result({ record: row, blob: blob instanceof Blob ? blob : null });
    });
  });
  changed(); return removed;
}
export const restoreRecord = (removed: RemovedRecord) => storeBlob(readRecord(removed.record), removed.blob, false);
