import { ApiError } from "../../../errors";
import type { Bindings } from "../../../config";
import type { PublishedMap } from "../../../../src/features/maps/domain/published";

// Narrow structural port for the real R2 binding; no credentials or public URLs.
type MediaObject = { size: number; httpEtag: string; body: ReadableStream<Uint8Array> };
export interface MapBucket {
  put(key: string, value: Uint8Array, options: { onlyIf: Headers; sha256: string; httpMetadata: { contentType: string } }): Promise<unknown>;
  get(key: string): Promise<MediaObject | null>;
}
export function mapBucket(env: Bindings): MapBucket {
  if (!env.MAP_MEDIA) throw new ApiError(503, "maps_unavailable", "Online map storage is unavailable.");
  return env.MAP_MEDIA;
}
export const mediaKey = (map: Pick<PublishedMap, "publisherId" | "revision" | "archiveSha256">) => `maps/${map.publisherId}/${map.revision}/${map.archiveSha256}.notsumap`;
export const archiveHash = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>)), byte => byte.toString(16).padStart(2, "0")).join("");

// A per-isolate gate bounds buffered uploads. It is not a global rate limiter.
let uploading = false;
export async function uploadSlot<T>(work: () => Promise<T>): Promise<T> {
  if (uploading) throw new ApiError(503, "upload_busy", "The upload service is busy. Retry the same pack shortly.");
  uploading = true;
  try { return await work(); } finally { uploading = false; }
}
