import { invoke, isTauri } from "@tauri-apps/api/core";
import { MAX_ARCHIVE_BYTES } from "./archive";

export const desktopSkinSave = () => isTauri();
export const skinFileName = (name: string) => `notsu-${name.replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 64) || "skin"}.notsuskin`;
export async function saveSkinPack(bytes: Uint8Array, name: string): Promise<boolean> {
  if (bytes.length < 22 || bytes.length > MAX_ARCHIVE_BYTES) throw new Error("A skin export must be a ZIP pack up to 16 MB.");
  if (!isTauri()) throw new Error("Use the browser download link to save this skin.");
  try { return await invoke<boolean>("save_skin_pack", bytes, { headers: { "x-skin-name": skinFileName(name) } }); }
  catch (cause) { throw new Error(typeof cause === "string" ? cause : "The skin file could not be saved. Try another location."); }
}
