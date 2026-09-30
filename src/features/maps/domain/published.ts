import { mapObject } from "./mapSet";
import { parsePlayerId } from "../../friends/domain/connections";

export const ONLINE_MAP_BYTES = 16 * 1024 * 1024;
export const ONLINE_CHART_BYTES = 256 * 1024;
export type MapCursor = { time: string; revision: string };
export type PublishedDifficulty = { id: string; name: string; author: string; notes: number; lanes: number; durationMs: number };
export type PublishedMap = {
  revision: string; onlineSetId: string; setId: string; publisherId: string; publisher: string;
  title: string; artist: string; author: string; difficulties: PublishedDifficulty[];
  bytes: number; archiveSha256: string; publishedAt: string; visible: boolean; moderated: boolean; version: string;
};
export function mapHash(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) throw new Error("Invalid map revision.");
  return value;
}
function label(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 256 || /[\x00-\x1f\x7f]/.test(value)) throw new Error("Invalid map text.");
  return value;
}
function number(value: unknown, min: number, max: number, integer = true): number {
  if (typeof value !== "number" || !Number.isFinite(value) || (integer && !Number.isSafeInteger(value)) || value < min || value > max) throw new Error("Invalid map metadata.");
  return value;
}
export function mapCursor(time: unknown, revision: unknown): MapCursor | null {
  if (time == null && revision == null) return null;
  if (typeof time !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(time) || !Number.isFinite(Date.parse(time))) throw new Error("Invalid map list position.");
  return { time, revision: mapHash(revision) };
}
export function publishedMap(value: unknown): PublishedMap {
  const row = mapObject(value), cursor = mapCursor(row.publishedAt, row.revision);
  if (!cursor || typeof row.visible !== "boolean" || typeof row.moderated !== "boolean" ||
    !Array.isArray(row.difficulties) || !row.difficulties.length || row.difficulties.length > 16 ||
    typeof row.publisher !== "string" || !/^[a-z][a-z0-9_]{2,19}$/.test(row.publisher)) throw new Error("Invalid published map.");
  const difficulties = row.difficulties.map(item => {
    const d = mapObject(item);
    return { id: label(d.id), name: label(d.name), author: label(d.author), notes: number(d.notes, 1, 50000), lanes: number(d.lanes, 1, 16), durationMs: number(d.durationMs, 1, 3600000, false) };
  });
  if (new Set(difficulties.map(d => d.id)).size !== difficulties.length) throw new Error("Duplicate published difficulties.");
  return { revision: cursor.revision, publishedAt: cursor.time, onlineSetId: parsePlayerId(row.onlineSetId), setId: label(row.setId),
    publisherId: parsePlayerId(row.publisherId), publisher: row.publisher, title: label(row.title), artist: label(row.artist), author: label(row.author),
    difficulties, bytes: number(row.bytes, 22, ONLINE_MAP_BYTES), archiveSha256: mapHash(row.archiveSha256), visible: row.visible,
    moderated: row.moderated, version: parsePlayerId(row.version) };
}
export function publishedPage(value: unknown): { items: PublishedMap[]; next: MapCursor | null } {
  const row = mapObject(value);
  if (!Array.isArray(row.items) || row.items.length > 30) throw new Error("Invalid map page.");
  const next = row.next === null ? null : mapObject(row.next);
  return { items: row.items.map(publishedMap), next: next ? mapCursor(next.time, next.revision) : null };
}
