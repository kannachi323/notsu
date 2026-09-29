import { invoke, isTauri } from "@tauri-apps/api/core";
import { MAX_MAP_BYTES } from "./package";
export const desktopMapSave = () => isTauri();
export const mapFileName = (title: string) => `notsu-${title.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "map"}.notsumap`;
export async function saveMapPack(bytes: Uint8Array, title: string): Promise<boolean> {
  if (bytes.length < 22 || bytes.length > MAX_MAP_BYTES) throw new Error("Map exports must be ZIP packages up to 128 MB.");
  if (!isTauri()) throw new Error("Use the browser download link to save this map.");
  try { return await invoke<boolean>("save_map_pack", bytes, { headers: { "x-map-name": mapFileName(title) } }); }
  catch (cause) { throw new Error(typeof cause === "string" ? cause : cause instanceof Error ? cause.message : "Could not save the map package."); }
}
