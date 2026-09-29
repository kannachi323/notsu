import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { deleteSkin, readSavedSkins, saveSkin } from "./storage";
import type { SkinRecord } from "./registry";
import { validateManifest } from "../domain/manifest";
const record: SkinRecord = { id: "skin:" + "b".repeat(64), archive: new Uint8Array([1, 2, 3]), ...validateManifest({ format: "notsu-skin", version: 1, name: "Saved", author: "Player", base: "midnight" }) };
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("saves across connections, deduplicates, deletes and restores original pack bytes", async () => {
  await saveSkin(record); await saveSkin(record);
  expect(await readSavedSkins()).toEqual([record]);
  await deleteSkin(record.id); expect(await readSavedSkins()).toEqual([]);
  await saveSkin(record); expect((await readSavedSkins())[0].archive).toEqual(record.archive);
});
it("rejects unavailable and quota-failed storage without losing existing records", async () => {
  await saveSkin(record);
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
  await expect(saveSkin({ ...record, id: "another" })).rejects.toThrow("Full");
  expect(await readSavedSkins()).toEqual([record]);
  vi.stubGlobal("indexedDB", { open() { throw new Error("Blocked"); } });
  await expect(readSavedSkins()).rejects.toThrow("Blocked");
});
it("bounds opening time so a hung storage request cannot block gameplay forever", async () => {
  vi.useFakeTimers(); vi.stubGlobal("indexedDB", { open: () => ({}) });
  const pending = expect(readSavedSkins()).rejects.toThrow("too long");
  await vi.advanceTimersByTimeAsync(5000); await pending;
});
