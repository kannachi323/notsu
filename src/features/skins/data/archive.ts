import { packZip, unpackZip } from "../../../shared/data/zip";
import type { ZipPolicy } from "../../../shared/data/zip";
export const MAX_ARCHIVE_BYTES = 16 * 1024 * 1024;
const policy: ZipPolicy = {
  label: "Skin", maxArchive: MAX_ARCHIVE_BYTES, maxExpanded: 24 * 1024 * 1024, maxFiles: 32,
  required: ["skin.json"],
  limitFor: name => name === "skin.json" ? 64 * 1024 : name.endsWith(".png") ? 8 * 1024 * 1024 : name.endsWith(".wav") ? 400 * 1024 : 0,
};
export const unpackSkin = (bytes: Uint8Array) => unpackZip(bytes, policy);
export const packSkin = (files: Record<string, Uint8Array>) => packZip(files, policy);
