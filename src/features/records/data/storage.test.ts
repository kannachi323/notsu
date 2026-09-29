import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { completed, source } from "./records.fixture";
import { prepareRecord } from "./prepare";
import { bestRecord } from "../domain/records";
import { listRecords, readPerformance, removeRecord, restoreRecord, storeRecord } from "./storage";
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function performance(id: string, errorMs = 0) { return prepareRecord(await completed(id, { errorMs }), source); }
function raw<T>(work: (tx: IDBTransaction) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open("notsu-records"); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result, tx = db.transaction(["records", "replays"], "readwrite"), request = work(tx);
      tx.oncomplete = () => { db.close(); resolve(request.result); }; tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}
it("persists exact replay/score data across connections and uses transactional best comparisons", async () => {
  const good = await performance("good", 70), perfect = await performance("perfect"), tied = await performance("tied");
  expect((await storeRecord(good)).outcome).toBe("first"); expect((await storeRecord(perfect)).outcome).toBe("improved");
  expect((await storeRecord(tied)).outcome).toBe("tied");
  expect(await readPerformance(perfect.record.id)).toEqual(perfect);
  const listed = await listRecords(source.revision, perfect.record.chartId);
  expect(listed.records).toHaveLength(3); expect(bestRecord(listed.records)?.summary.score).toBe(1000000);
});
it("saves retries idempotently and rejects reuse of an attempt ID with another result", async () => {
  const saved = await performance("same"), other = await performance("same", 70);
  const outcomes = (await Promise.all([storeRecord(saved), storeRecord(saved)])).map(row => row.outcome);
  expect(outcomes).toEqual(["first", "already-saved"]); expect((await listRecords(source.revision, saved.record.chartId)).records).toHaveLength(1);
  await expect(storeRecord(other)).rejects.toThrow("already used"); expect(await readPerformance("same")).toEqual(saved);
});
it("isolates map revisions and difficulties and never lets assisted runs replace a Standard best", async () => {
  const standard = await performance("standard", 70), practice = await prepareRecord(await completed("practice", { mods: { autoplay: true } }), source);
  await storeRecord(standard); expect((await storeRecord(practice)).outcome).toBe("practice");
  const other = await prepareRecord(await completed("revision"), { ...source, revision: "c".repeat(64) }); await storeRecord(other);
  expect((await listRecords(source.revision, "different-chart")).records).toHaveLength(0);
  const rows = (await listRecords(source.revision, standard.record.chartId)).records;
  expect(rows).toHaveLength(2); expect(bestRecord(rows)?.id).toBe("standard");
  expect((await listRecords(other.record.revision, other.record.chartId)).records).toHaveLength(1);
});
it("rolls back summary/replay writes on quota failure and can retry afterward", async () => {
  const saved = await performance("retry"), add = IDBObjectStore.prototype.add;
  const spy = vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(function(this: IDBObjectStore, ...args: Parameters<typeof add>) {
    if (this.name === "replays") throw new Error("Full"); return add.apply(this, args);
  });
  await expect(storeRecord(saved)).rejects.toThrow("Full"); spy.mockRestore();
  expect((await listRecords(source.revision, saved.record.chartId)).records).toHaveLength(0);
  await storeRecord(saved); expect(await readPerformance(saved.record.id)).toEqual(saved);
});
it("removes and restores a best without losing either replay or previous best", async () => {
  const good = await performance("good", 70), perfect = await performance("perfect"); await storeRecord(good); await storeRecord(perfect);
  const removed = await removeRecord("perfect");
  expect(bestRecord((await listRecords(source.revision, perfect.record.chartId)).records)?.id).toBe("good");
  await expect(readPerformance("perfect")).rejects.toThrow("no longer");
  await restoreRecord(removed); expect(await readPerformance("perfect")).toEqual(perfect);
  expect(bestRecord((await listRecords(source.revision, perfect.record.chartId)).records)?.id).toBe("perfect");
});
it("permits removal and Undo even when replay JSON is damaged", async () => {
  const saved = await performance("damaged"); await storeRecord(saved);
  await raw(tx => tx.objectStore("replays").put({ id: "damaged", blob: new Blob(["invalid"]) }));
  await expect(readPerformance("damaged")).rejects.toThrow("damaged");
  const removed = await removeRecord("damaged"); expect(await removed.blob?.text()).toBe("invalid");
  await restoreRecord(removed); expect((await listRecords(source.revision, saved.record.chartId)).records).toHaveLength(1);
  await expect(readPerformance("damaged")).rejects.toThrow("damaged");
  await storeRecord(saved); expect(await readPerformance("damaged")).toEqual(saved);
});
it("keeps existing data intact if a removal transaction fails", async () => {
  const saved = await performance("kept"); await storeRecord(saved);
  const original = IDBObjectStore.prototype.delete;
  const spy = vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(function(this: IDBObjectStore, ...args: Parameters<typeof original>) {
    if (this.name === "replays") throw new Error("Locked"); return original.apply(this, args);
  });
  await expect(removeRecord("kept")).rejects.toThrow("Locked"); spy.mockRestore(); expect(await readPerformance("kept")).toEqual(saved);
});
it("bounds the record library without silently deleting old bests", async () => {
  const saved = await performance("kept"); await storeRecord(saved);
  await raw(tx => { const store = tx.objectStore("records"); for (let i = 1; i < 1000; i++) store.add({ ...saved.record, id: `old-${i}` }); return store.count(); });
  await expect(storeRecord(await performance("overflow"))).rejects.toThrow("1,000"); expect(await readPerformance("kept")).toEqual(saved);
  const removed = await removeRecord("old-1"); expect(removed.blob).toBeNull();
  await storeRecord(await performance("overflow")); expect((await listRecords(source.revision, saved.record.chartId)).records).toHaveLength(1000);
});
it("rejects damaged metadata and bounds unavailable/open waits", async () => {
  const saved = await performance("damaged"); await storeRecord(saved);
  await raw(tx => tx.objectStore("records").put({ ...saved.record, summary: { ...saved.record.summary, score: -1 } }));
  expect(await listRecords(source.revision, saved.record.chartId)).toEqual({ records: [], unreadable: 1 });
  vi.stubGlobal("indexedDB", { open() { throw new Error("Unavailable"); } }); await expect(storeRecord(saved)).rejects.toThrow("Unavailable");
  vi.useFakeTimers(); vi.stubGlobal("indexedDB", { open: () => ({}) });
  const pending = expect(listRecords(source.revision, saved.record.chartId)).rejects.toThrow("too long"); await vi.advanceTimersByTimeAsync(5000); await pending;
});
it("enforces the replay byte budget without evicting existing records", async () => {
  const saved = await performance("kept"); await storeRecord(saved);
  await raw(tx => tx.objectStore("replays").add({ id: "large-existing", blob: new Blob([new Uint8Array(128 * 1024 * 1024)]) }));
  await expect(storeRecord(await performance("over-budget"))).rejects.toThrow("128 MB");
  expect(await readPerformance("kept")).toEqual(saved);
  expect((await listRecords(source.revision, saved.record.chartId)).records).toHaveLength(1);
});
