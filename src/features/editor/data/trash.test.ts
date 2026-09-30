import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBCursor, IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { createDocument } from "../domain/document";
import { recoveryCopy } from "../domain/copies";
import { editDocument } from "../domain/commands";
import { createDraft, createDrafts, listDrafts, readDraft, saveDraft } from "./storage";
import { listTrash, purgeDraft, restoreDraft, trashDraft } from "./trash";
import { DraftWriter } from "./DraftWriter";
const bytes = new Uint8Array([1, 2, 3]).buffer;
const document = (id = "first") => createDocument(id, { sha256: "a".repeat(64), mime: "audio/wav", fileName: "Song.wav", durationMs: 30000, size: 3 }, "Song");
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function raw<T>(work: (tx: IDBTransaction) => IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open("notsu-editor"); open.onerror = () => reject(open.error);
    open.onsuccess = () => { const db = open.result, tx = db.transaction(Array.from(db.objectStoreNames), "readwrite"), request = work(tx);
      tx.oncomplete = () => { db.close(); resolve(request.result); }; tx.onabort = () => { db.close(); reject(tx.error); };
    };
  });
}
it("upgrades version-one storage without changing the chart, recording or old revision", async () => {
  const doc = document();
  await new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("notsu-editor", 1);
    open.onupgradeneeded = () => {
      open.result.createObjectStore("drafts", { keyPath: "id" }).add({ id: doc.id, document: doc, revision: 7, updatedAt: 100 });
      open.result.createObjectStore("songs", { keyPath: "hash" }).add({ hash: doc.song.sha256, blob: new Blob([bytes]) });
    };
    open.onerror = () => reject(open.error); open.onsuccess = () => { open.result.close(); resolve(); };
  });
  const restored = await readDraft(doc.id);
  expect(restored.row.document).toEqual(doc); expect(restored.row.revision).toBe(7);
  expect(await restored.blob.arrayBuffer()).toEqual(bytes); expect(await listTrash()).toEqual([]);
  expect((await saveDraft(doc, restored.row)).revision).toBe(8);
});
it("trashes and restores the exact authored chart and rejects a writer from before restoration", async () => {
  const doc = editDocument(document(), { type: "place", id: "hold", timeMs: 1000, endMs: 2500, laneIds: ["line-1"], divisor: 4 });
  const version = await createDraft(doc, bytes);
  await trashDraft(doc.id, version); expect(await listDrafts()).toEqual([]);
  await expect(readDraft(doc.id)).rejects.toThrow("no longer");
  await expect(saveDraft(doc, version)).rejects.toThrow("another window");
  await expect(createDraft(doc, bytes)).rejects.toThrow("Trash");
  const removed = (await listTrash())[0]; expect(removed.notes).toBe(1);
  await restoreDraft(doc.id, removed.token);
  const restored = await readDraft(doc.id); expect(restored.row.document).toEqual(doc);
  expect(await restored.blob.arrayBuffer()).toEqual(bytes); expect(await listTrash()).toEqual([]);
  await expect(saveDraft(doc, version)).rejects.toThrow("another window");
  await expect(restoreDraft(doc.id, removed.token)).rejects.toThrow();
});
it("rejects stale list actions and old Trash confirmations after restore/re-trash", async () => {
  const doc = document(), first = await createDraft(doc, bytes), second = await saveDraft(doc, first);
  await expect(trashDraft(doc.id, first)).rejects.toThrow("another window");
  await trashDraft(doc.id, second); const stale = (await listTrash())[0];
  await restoreDraft(doc.id, stale.token); const restored = await readDraft(doc.id);
  await trashDraft(doc.id, restored.row);
  await expect(purgeDraft(doc.id, stale.token)).rejects.toThrow("another window");
  expect(await listTrash()).toHaveLength(1);
});
it("keeps shared audio for active and trashed siblings; frees it only after the last reference", async () => {
  const a = document(), b = { ...document("second"), setId: a.setId, difficulty: "Hard" };
  const [one, two] = await createDrafts([a, b], bytes);
  await trashDraft(a.id, one); await purgeDraft(a.id, (await listTrash())[0].token);
  expect(await (await readDraft(b.id)).blob.arrayBuffer()).toEqual(bytes);
  const replacement = await createDraft(a, bytes);
  await trashDraft(b.id, two); await trashDraft(a.id, replacement);
  await purgeDraft(a.id, (await listTrash()).find(row => row.id === a.id)!.token);
  expect(await raw(tx => tx.objectStore("songs").count())).toBe(1);
  await restoreDraft(b.id, (await listTrash())[0].token);
  expect(await (await readDraft(b.id)).blob.arrayBuffer()).toEqual(bytes);
  await trashDraft(b.id, (await readDraft(b.id)).row); await purgeDraft(b.id, (await listTrash())[0].token);
  expect(await raw(tx => tx.objectStore("songs").count())).toBe(0);
  const reimported = await createDraft(a, bytes); expect(reimported.revision).toBe(one.revision);
  await expect(saveDraft(a, one)).rejects.toThrow("another window");
});
it("rolls back Trash moves, restores and purges on storage failure", async () => {
  const doc = document(), version = await createDraft(doc, bytes);
  const add = vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(() => { throw new Error("Full"); });
  await expect(trashDraft(doc.id, version)).rejects.toThrow("Full"); expect((await readDraft(doc.id)).row.document).toEqual(doc);
  add.mockRestore(); await trashDraft(doc.id, version); const entry = (await listTrash())[0];
  const restoreAdd = vi.spyOn(IDBObjectStore.prototype, "add").mockImplementation(() => { throw new Error("Full"); });
  await expect(restoreDraft(doc.id, entry.token)).rejects.toThrow("Full"); restoreAdd.mockRestore();
  const deletion = vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(() => { throw new Error("Locked"); });
  await expect(purgeDraft(doc.id, entry.token)).rejects.toThrow("Locked"); deletion.mockRestore();
  expect(await listTrash()).toHaveLength(1); await restoreDraft(doc.id, entry.token);
  expect(await (await readDraft(doc.id)).blob.arrayBuffer()).toEqual(bytes);
});
it("preserves possible recovery audio when another saved record has an unknown song reference", async () => {
  const doc = document(), row = await createDraft(doc, bytes);
  await raw(tx => tx.objectStore("drafts").add({ id: "damaged", document: { song: null } }));
  await trashDraft(doc.id, row); await purgeDraft(doc.id, (await listTrash())[0].token);
  expect(await raw(tx => tx.objectStore("songs").count())).toBe(1);
  expect((await listDrafts())[0]).toMatchObject({ title: "Unreadable draft", version: null });
});
it("counts Trash toward the 50-draft budget and frees capacity only on permanent removal", async () => {
  const first = await createDraft(document(), bytes);
  for (let i = 1; i < 50; i++) await createDraft(document(`draft-${i}`), bytes);
  await trashDraft(first.id, first); await expect(createDraft(document("extra"), bytes)).rejects.toThrow("including Trash");
  await purgeDraft(first.id, (await listTrash())[0].token); await createDraft(document("extra"), bytes);
  expect(await listDrafts()).toHaveLength(50);
});
it("retries transient autosave failure with the newest pending edit and never rebases a conflict", async () => {
  const doc = document(), row = await createDraft(doc, bytes);
  let fail = true;
  const writer = new DraftWriter(row, async (next, version) => { if (fail) throw new Error("Full"); return saveDraft(next, version); });
  writer.enqueue(doc); await expect(writer.flush()).rejects.toThrow("Full");
  const latest = editDocument(doc, { type: "metadata", title: "Newest", artist: "Artist", author: "Mapper", difficulty: "Hard" });
  writer.enqueue(latest); fail = false; await writer.retry(); expect(writer.dirty).toBe(false); expect(writer.error).toBeUndefined();
  expect((await readDraft(doc.id)).row.document).toEqual(latest);
  const stale = new DraftWriter(row); stale.enqueue(doc); await expect(stale.flush()).rejects.toThrow("another window");
  await expect(stale.retry()).rejects.toThrow("another window"); expect(stale.dirty).toBe(true);
  const copy = recoveryCopy(doc, "recovery"); await createDraft(copy, bytes);
  expect((await readDraft(doc.id)).row.document).toEqual(latest); expect((await readDraft(copy.id)).row.document).toEqual(copy);
});

it("rolls back both draft removal and audio collection when deleting a song fails", async () => {
  const doc = document(), row = await createDraft(doc, bytes);
  await trashDraft(doc.id, row); const entry = (await listTrash())[0];
  const deletion = vi.spyOn(IDBCursor.prototype, "delete").mockImplementation(() => { throw new Error("Song locked"); });
  await expect(purgeDraft(doc.id, entry.token)).rejects.toThrow("Song locked"); deletion.mockRestore();
  expect(await listTrash()).toHaveLength(1); expect(await raw(tx => tx.objectStore("songs").count())).toBe(1);
  await restoreDraft(doc.id, entry.token); expect((await readDraft(doc.id)).row.document).toEqual(doc);
});
it("joins an in-flight retry and keeps newly queued work after another failure", async () => {
  const doc = document(), row = await createDraft(doc, bytes);
  let release: () => void = () => {}; const gate = new Promise<void>(resolve => { release = resolve; });
  const write = vi.fn(async () => { await gate; throw new Error("Full"); });
  const writer = new DraftWriter(row, write); writer.enqueue(doc);
  const first = expect(writer.flush()).rejects.toThrow("Full");
  const second = expect(writer.retry()).rejects.toThrow("Full");
  writer.enqueue({ ...doc, difficulty: "Newest pending edit" }); release(); await Promise.all([first, second]);
  expect(write).toHaveBeenCalledTimes(1); expect(writer.dirty).toBe(true);
  await expect(writer.retry()).rejects.toThrow("Full");
  expect(write).toHaveBeenLastCalledWith(expect.objectContaining({ difficulty: "Newest pending edit" }), row);
  expect(writer.dirty).toBe(true);
});
