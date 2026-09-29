import { parsePlayerId } from "../../friends/domain/connections";

export type Visibility = "hidden" | "friends";
export interface OwnPresence { visibility: Visibility; validForMs: number }
export interface PresenceInput { clientId: string; sequence: number; visible: boolean }
export interface FriendPresence { userId: string; online: boolean; validForMs: number }
export interface PresenceSnapshot { userId: string; onlineUntil: number }

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid presence details.");
  return value as Record<string, unknown>;
}
export function visibility(value: unknown): Visibility {
  if (value !== "hidden" && value !== "friends") throw new Error("Choose who can see your online status.");
  return value;
}
export function visibilityInput(value: unknown): Visibility {
  const row = object(value);
  if (Object.keys(row).length !== 1 || !("visibility" in row)) throw new Error("Only visibility can be changed.");
  return visibility(row.visibility);
}
export function presenceInput(value: unknown): PresenceInput {
  const row = object(value);
  if (Object.keys(row).some(key => !["clientId", "sequence", "visible"].includes(key)) || typeof row.visible !== "boolean" || !Number.isInteger(row.sequence) || Number(row.sequence) < 1 || Number(row.sequence) > 2147483647) throw new Error("Invalid presence update.");
  return { clientId: parsePlayerId(row.clientId), sequence: Number(row.sequence), visible: row.visible };
}
function lifetime(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 0 || Number(value) > 90000) throw new Error("Invalid status lifetime.");
  return Number(value);
}
export function ownPresence(value: unknown): OwnPresence {
  const row = object(value), mode = visibility(row.visibility), duration = lifetime(row.validForMs);
  if (mode === "hidden" && duration !== 0) throw new Error("Hidden status cannot be online.");
  return { visibility: mode, validForMs: duration };
}
export function presenceTargets(value: unknown): string[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 50) throw new Error("Check up to 50 players at a time.");
  const ids = value.map(parsePlayerId);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate players.");
  return ids;
}
export function friendPresence(value: unknown): FriendPresence {
  const row = object(value), duration = lifetime(row.validForMs);
  if (typeof row.online !== "boolean" || row.online !== (duration > 0)) throw new Error("Inconsistent online status.");
  return { userId: parsePlayerId(row.userId), online: row.online, validForMs: duration };
}
/** Subtract the full round trip so delayed responses cannot extend a server lease. */
export function snapshot(rows: FriendPresence[], startedAt: number, receivedAt: number): PresenceSnapshot[] {
  return rows.map(row => ({ userId: row.userId, onlineUntil: receivedAt + Math.max(0, row.validForMs - Math.max(0, receivedAt - startedAt)) }));
}
export function isOnline(value: PresenceSnapshot | undefined, monotonicNow: number): boolean | null {
  return value ? value.onlineUntil > monotonicNow : null;
}
