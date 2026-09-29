import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { IDBFactory, IDBObjectStore } from "fake-indexeddb";
import { packSkin, unpackSkin } from "./data/archive";
vi.mock("./data/archiveClient", () => ({ archiveJob: async ({ bytes }: { bytes: Uint8Array }) => unpackSkin(bytes) }));
vi.mock("../rhythm/data/gameplayAtlas", () => ({ loadGameplayAtlas: async () => undefined }));
const file = (name = "Local", change: object = {}) => new File([new Uint8Array(packSkin({ "skin.json": new TextEncoder().encode(JSON.stringify({ format: "notsu-skin", version: 1, name, author: "Player", base: "midnight", ...change })) }))], "test.notsuskin");
beforeEach(() => { vi.resetModules(); vi.stubGlobal("indexedDB", new IDBFactory()); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("imports, deduplicates, removes and restores a skin across an application restart", async () => {
  const source = file(), catalog = await import("./useSkinCatalog"), record = await catalog.importSkin(source);
  await catalog.importSkin(source); expect(catalog.useSkinCatalog.getState().items).toHaveLength(1);
  await catalog.removeSkin(record.id); expect(catalog.useSkinCatalog.getState().items).toHaveLength(0);
  await catalog.restoreSkin(record); vi.resetModules();
  const reopened = await import("./useSkinCatalog"); await reopened.initializeSkins();
  expect(reopened.useSkinCatalog.getState().items[0].id).toBe(record.id);
  expect((await import("./data/registry")).getSkin(record.id).name).toBe("Local");
});
it("continues with removable session-only skins when persistence fails", async () => {
  vi.stubGlobal("indexedDB", { open() { throw new Error("Blocked"); } });
  const catalog = await import("./useSkinCatalog"), record = await catalog.importSkin(file());
  expect(catalog.useSkinCatalog.getState().notice).toContain("session");
  expect(catalog.useSkinCatalog.getState().ready).toBe(true);
  expect(await catalog.prepareSkin(record.id)).toMatchObject({ sprites: {}, sounds: {} });
  await catalog.removeSkin(record.id); expect(catalog.useSkinCatalog.getState().items).toHaveLength(0);
});
it("does not claim persisted removal succeeded after a write failure", async () => {
  const catalog = await import("./useSkinCatalog"), record = await catalog.importSkin(file());
  vi.spyOn(IDBObjectStore.prototype, "delete").mockImplementation(() => { throw new Error("Unavailable"); });
  await expect(catalog.removeSkin(record.id)).rejects.toThrow();
  expect(catalog.useSkinCatalog.getState().items).toHaveLength(1);
});
it("restores definitions from archive contents and rejects modified saved bytes", async () => {
  const catalog = await import("./useSkinCatalog"), record = await catalog.importSkin(file());
  const { saveSkin } = await import("./data/storage");
  await saveSkin({ ...record, manifest: { ...record.manifest, name: "Incorrect cached name" } });
  vi.resetModules(); const restored = await import("./useSkinCatalog"); await restored.initializeSkins();
  expect(restored.useSkinCatalog.getState().items[0].manifest.name).toBe("Local");
  const changed = new Uint8Array(await file("Changed").arrayBuffer());
  await saveSkin({ ...record, archive: changed }); vi.resetModules();
  const corrupt = await import("./useSkinCatalog"); await corrupt.initializeSkins();
  expect(corrupt.useSkinCatalog.getState().items).toHaveLength(0); expect(corrupt.useSkinCatalog.getState().notice).toContain("could not be read");
});
it("leaves installed skins intact after an invalid import", async () => {
  const catalog = await import("./useSkinCatalog"); await catalog.importSkin(file());
  await expect(catalog.importSkin(file("Bad", { score: 100 }))).rejects.toThrow();
  expect(catalog.useSkinCatalog.getState().items).toHaveLength(1);
});
it("limits the catalog without blocking reimport of an existing pack", async () => {
  const catalog = await import("./useSkinCatalog");
  const sources = Array.from({ length: 20 }, (_, i) => file(`Skin ${i}`));
  for (const source of sources) await catalog.importSkin(source);
  await expect(catalog.importSkin(file("One too many"))).rejects.toThrow("limit reached");
  await catalog.importSkin(sources[0]); expect(catalog.useSkinCatalog.getState().items).toHaveLength(20);
});
