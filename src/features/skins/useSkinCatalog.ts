import { create } from "zustand";
import { applyManifest, isSkinId } from "./domain/manifest";
import { cacheSkinAssets, forgetSkin, getSkin, registerSkin, skinAssets } from "./data/registry";
import type { SkinAssets, SkinRecord } from "./data/registry";
import { parseSkinPack, loadSkinAssets } from "./data/loadPack";
import { readSavedSkins, saveSkin, deleteSkin } from "./data/storage";
import { loadGameplayAtlas } from "../rhythm/data/gameplayAtlas";

type Catalog = { items: SkinRecord[]; ready: boolean; revision: number; notice: string };
export const useSkinCatalog = create<Catalog>(() => ({ items: [], ready: false, revision: 0, notice: "" }));
let initializing: Promise<void> | undefined;
const ephemeral = new Set<string>();
const loading = new Map<string, Promise<SkinAssets>>();
const put = (record: SkinRecord) => {
  registerSkin(applyManifest(record.id, record.manifest));
  useSkinCatalog.setState(state => ({ items: [...state.items.filter(item => item.id !== record.id), record], revision: state.revision + 1 }));
};
export function initializeSkins(): Promise<void> {
  return initializing ??= (async () => {
    try {
      let bytes = 0;
      for (const raw of await readSavedSkins()) {
        try {
          if (!isSkinId(raw.id) || !raw.id.startsWith("skin:") || !(raw.archive instanceof Uint8Array) || raw.archive.byteLength > 16 * 1024 * 1024) throw new Error("Invalid stored skin.");
          bytes += raw.archive.byteLength;
          if (bytes > 128 * 1024 * 1024) throw new Error("Storage budget exceeded.");
          const restored = await parseSkinPack(raw.archive);
          if (restored.id !== raw.id) throw new Error("Stored pack has changed.");
          put(restored);
        } catch { useSkinCatalog.setState({ notice: "A saved skin could not be read. Your original pack can be imported again." }); }
      }
    } catch { useSkinCatalog.setState({ notice: "Skin storage is unavailable. Imports will work for this session only." }); }
    finally { useSkinCatalog.setState({ ready: true }); }
  })();
}
export async function prepareSkin(id: string): Promise<SkinAssets | undefined> {
  await initializeSkins();
  if (getSkin(id).atlas) await loadGameplayAtlas();
  if (!id.startsWith("skin:")) return undefined;
  const cached = skinAssets(id); if (cached) return cached;
  const record = useSkinCatalog.getState().items.find(item => item.id === id);
  if (!record) return undefined;
  let promise = loading.get(id);
  if (!promise) {
    promise = loadSkinAssets(record).catch((): SkinAssets => ({ sprites: {}, sounds: {}, warnings: ["This stored pack could not be decoded. Using base assets; import the original pack again."] }));
    loading.set(id, promise);
  }
  try { const assets = await promise; cacheSkinAssets(id, assets); return assets; }
  finally { loading.delete(id); }
}
export async function importSkin(file: File): Promise<SkinRecord> {
  await initializeSkins();
  if (file.size > 16 * 1024 * 1024) throw new Error("Choose a skin pack smaller than 16 MB.");
  const record = await parseSkinPack(new Uint8Array(await file.arrayBuffer()));
  checkCapacity(record);
  const assets = await loadSkinAssets(record); record.warnings = assets.warnings;
  await persist(record);
  cacheSkinAssets(record.id, assets); put(record); return record;
}
export async function removeSkin(id: string): Promise<SkinRecord | undefined> {
  const record = useSkinCatalog.getState().items.find(item => item.id === id); if (!record) return undefined;
  try { await deleteSkin(id); } catch (cause) { if (!ephemeral.has(id)) throw cause; }
  ephemeral.delete(id); forgetSkin(id);
  useSkinCatalog.setState(state => ({ items: state.items.filter(item => item.id !== id), revision: state.revision + 1 })); return record;
}
function checkCapacity(record: SkinRecord) {
  const other = useSkinCatalog.getState().items.filter(item => item.id !== record.id);
  if (other.length >= 20 || other.reduce((sum, item) => sum + item.archive.byteLength, record.archive.byteLength) > 128 * 1024 * 1024) throw new Error("Skin storage limit reached. Remove a skin before importing another.");
}
async function persist(record: SkinRecord) {
  try { await saveSkin(record); ephemeral.delete(record.id); }
  catch {
    ephemeral.add(record.id);
    useSkinCatalog.setState({ notice: "This skin is available for this session, but could not be saved. Free storage or enable local storage to keep imports." });
  }
}
export async function restoreSkin(record: SkinRecord): Promise<void> {
  checkCapacity(record); await persist(record); put(record);
}
