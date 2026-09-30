import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { createDocument } from "../domain/document";
import { editDocument } from "../domain/commands";
import { createDraft, createDrafts, listDrafts, readDraft, readSetDrafts, saveDraft } from "./storage";
import { DraftWriter } from "./DraftWriter";
const bytes = new Uint8Array([1, 2, 3]).buffer;
const document = (id = "first") => createDocument(id, { sha256: "a".repeat(64), mime: "audio/wav", fileName: "Song.wav", durationMs: 30000, size: 3 }, "Song");
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("recovers a complete authored draft and its original recording across database connections", async () => {
  const doc = document(), saved = await createDraft(doc, bytes);
  const edited = editDocument(doc, { type: "place", id: "hold", timeMs: 1000, endMs: 2000, laneIds: ["line-1"], divisor: 4 });
  expect((await saveDraft(edited, saved)).revision).toBe(2);
  const reopened = await readDraft(doc.id); expect(reopened.row.document).toEqual(edited);
  expect(await reopened.blob.arrayBuffer()).toEqual(bytes);
  expect((await listDrafts())[0]).toMatchObject({ title: "Song", notes: 1 });
});
it("rejects stale writers so one window cannot overwrite another window's edits", async () => {
  const doc = document(), version = await createDraft(doc, bytes);
  const edited = editDocument(doc, { type: "metadata", title: "Other window", artist: "Artist", author: "Mapper", difficulty: "Normal" });
  await saveDraft(edited, version);
  await expect(saveDraft(doc, version)).rejects.toThrow("another window");
  expect((await readDraft(doc.id)).row.document.chart.title).toBe("Other window");
});
it("does not lose saved drafts when writes fail or storage is unavailable", async () => {
  const doc = document(), version = await createDraft(doc, bytes);
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
  await expect(saveDraft(doc, version)).rejects.toThrow("Full");
  expect((await readDraft(doc.id)).row.revision).toBe(1);
  vi.stubGlobal("indexedDB", { open() { throw new Error("Unavailable"); } });
  await expect(listDrafts()).rejects.toThrow("Unavailable");
});
it("rolls back a song insert when the draft cannot be created, and keeps distinct difficulties", async () => {
  const doc = document(); await createDraft(doc, bytes);
  await expect(createDraft(doc, bytes)).rejects.toThrow();
  await createDraft(document("second"), bytes);
  expect(await listDrafts()).toHaveLength(2);
  await expect(createDraft(document("third"), new ArrayBuffer(4))).rejects.toThrow("size");
  expect(await listDrafts()).toHaveLength(2);
});
it("bounds storage-open waits and rejects missing drafts", async () => {
  await expect(readDraft("missing")).rejects.toThrow("no longer");
  vi.useFakeTimers(); vi.stubGlobal("indexedDB", { open: () => ({}) });
  const pending = expect(listDrafts()).rejects.toThrow("too long"); await vi.advanceTimersByTimeAsync(5000); await pending;
});
it("serializes in-flight autosaves and keeps the newest edit", async () => {
  const doc = document(), version = await createDraft(doc, bytes);
  let release: () => void = () => {}; const gate = new Promise<void>(resolve => { release = resolve; });
  const calls: number[] = [];
  const writer = new DraftWriter(version, async (value, expected) => { calls.push(expected.revision); if (expected.revision === 1) await gate; return saveDraft(value, expected); });
  writer.enqueue(doc); const first = writer.flush();
  writer.enqueue(editDocument(doc, { type: "metadata", title: "Intermediate", artist: "Artist", author: "Mapper", difficulty: "Normal" }));
  const latest = editDocument(doc, { type: "metadata", title: "Newest", artist: "Artist", author: "Mapper", difficulty: "Normal" });
  writer.enqueue(latest); const second = writer.flush(); release(); await Promise.all([first, second]);
  expect(calls).toEqual([1, 2]); expect(writer.dirty).toBe(false);
  expect((await readDraft(doc.id)).row.document.chart.title).toBe("Newest");
});
it("keeps a failed autosave dirty instead of displaying false success", async () => {
  const writer = new DraftWriter({ revision: 1 }, async () => { throw new Error("Full"); }); writer.enqueue(document());
  await expect(writer.flush()).rejects.toThrow("Full"); expect(writer.dirty).toBe(true);
  await expect(writer.flush()).rejects.toThrow("Full");
});
it("imports all difficulties atomically and recovers one consistent set snapshot", async () => {
  const first = document(), second = { ...document("second"), setId: first.setId, difficulty: "Hard" };
  await createDrafts([first, second], bytes);
  expect(await readSetDrafts(first.setId)).toEqual([first, second]);
  const third = { ...document("third"), setId: first.setId };
  await expect(createDrafts([third, second], bytes)).rejects.toThrow("already");
  expect(await listDrafts()).toHaveLength(2); await expect(readDraft("third")).rejects.toThrow("no longer");
});
