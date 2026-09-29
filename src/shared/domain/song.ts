export type SongReference = { sha256: string; fileName: string; mime: "audio/mpeg" | "audio/wav"; size: number; durationMs: number };
export function songReference(value: unknown): SongReference {
  if (!value || typeof value !== "object") throw new Error("Invalid song reference.");
  const audio = value as Record<string, unknown>;
  if (typeof audio.sha256 !== "string" || !/^[a-f0-9]{64}$/.test(audio.sha256) ||
    (audio.mime !== "audio/mpeg" && audio.mime !== "audio/wav") ||
    typeof audio.size !== "number" || !Number.isSafeInteger(audio.size) || audio.size <= 0 || audio.size > 100 * 1024 * 1024 ||
    typeof audio.durationMs !== "number" || !Number.isFinite(audio.durationMs) || audio.durationMs < 1000 || audio.durationMs > 30 * 60000 ||
    typeof audio.fileName !== "string" || !audio.fileName.trim() || audio.fileName.length > 256 || /[\x00-\x1f\x7f]/.test(audio.fileName)) throw new Error("Invalid song reference.");
  return { sha256: audio.sha256, mime: audio.mime, size: audio.size, durationMs: audio.durationMs, fileName: audio.fileName.trim() };
}
