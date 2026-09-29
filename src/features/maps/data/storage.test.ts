import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { mapFixture } from "./package.fixture";
import { packMap, unpackMap } from "./package";
import { favoriteMap, listMaps, readMap, removeMap, restoreMap, storeMap } from "./storage";
beforeEach(() => vi.stubGlobal("indexedDB", new IDBFactory()));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function imported() { const { set, audio } = await mapFixture(), { bytes } = await packMap(set, audio); return { bytes, loaded: await unpackMap(bytes) }; }
it("persists packages and favorites, deduplicates content and retains separate revisions", async () => {
  const { bytes, loaded } = await imported(); const first = await storeMap(loaded, bytes);
  await favoriteMap(first.revision, true); await storeMap(loaded, bytes);
  expect((await readMap(first.revision)).favorite).toBe(true);
  expect(await (await readMap(first.revision)).archive.arrayBuffer()).toEqual(bytes.buffer);
  loaded.set.title = "Revised title"; const second = await packMap(loaded.set, loaded.audio);
  await storeMap(await unpackMap(second.bytes), second.bytes);
  expect((await listMaps()).maps).toHaveLength(2);
  expect((await readMap(first.revision)).title).toBe("Original song");
});
it("removes only the selected revision and restores its complete package with Undo", async () => {
  const { bytes, loaded } = await imported(); await storeMap(loaded, bytes); await favoriteMap(loaded.revision, true);
  const removed = await removeMap(loaded.revision); expect((await listMaps()).maps).toHaveLength(0);
  await restoreMap(removed); expect((await readMap(loaded.revision)).favorite).toBe(true);
  await expect(removeMap("missing")).rejects.toThrow("no longer");
});
it("does not lose existing maps on quota errors or unavailable storage", async () => {
  const { bytes, loaded } = await imported(); await storeMap(loaded, bytes);
  vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => { throw new DOMException("Full", "QuotaExceededError"); });
  await expect(favoriteMap(loaded.revision, true)).rejects.toThrow("Full"); expect((await readMap(loaded.revision)).favorite).toBe(false);
  vi.stubGlobal("indexedDB", { open() { throw new Error("Unavailable"); } }); await expect(listMaps()).rejects.toThrow("Unavailable");
});
it("times out blocked opens and rejects incomplete stored records before use", async () => {
  expect(() => restoreMap({ revision: "a" } as never)).toThrow();
  vi.useFakeTimers(); vi.stubGlobal("indexedDB", { open: () => ({}) });
  const pending = expect(listMaps()).rejects.toThrow("too long"); await vi.advanceTimersByTimeAsync(5000); await pending;
});
it("repairs damaged archive bytes on verified reimport without losing favorites", async () => {
  const { bytes, loaded } = await imported(), first = await storeMap(loaded, bytes);
  await removeMap(first.revision);
  await restoreMap({ ...first, favorite: true, archive: new Blob([new Uint8Array(100)]) });
  const repaired = await storeMap(loaded, bytes);
  expect(repaired.favorite).toBe(true); expect(repaired.importedAt).toBe(first.importedAt);
  expect(await repaired.archive.arrayBuffer()).toEqual(bytes.buffer);
});
