import { parseProfileInput } from "../../accounts/domain/profile";

export const connectionLists = ["friends", "incoming", "outgoing", "blocked"] as const;
export type ConnectionList = typeof connectionLists[number];
export type ConnectionState = ConnectionList | "none" | "self" | "unavailable";
export type ConnectionAction = "send" | "accept" | "decline" | "cancel" | "remove" | "block" | "unblock";
export interface Connection { state: ConnectionState; id: string | null }
export interface ConnectionChange { action: ConnectionAction; expectedId?: string }
export interface ConnectionItem { id: string; userId: string; username: string; displayName: string; createdAt: string; state: ConnectionList }
export interface ConnectionCursor { time: string; id: string }
export interface ConnectionPage { items: ConnectionItem[]; next: ConnectionCursor | null }

export function parsePlayerId(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new Error("Invalid player identity.");
  return value.toLowerCase();
}
export function parseConnectionList(value: unknown): ConnectionList {
  if (!connectionLists.includes(value as ConnectionList)) throw new Error("Choose a valid connection list.");
  return value as ConnectionList;
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid connection details.");
  return value as Record<string, unknown>;
}
export function parseConnectionChange(value: unknown): ConnectionChange {
  const row = object(value);
  if (Object.keys(row).some(key => !["action", "expectedId"].includes(key)) ||
      !["send", "accept", "decline", "cancel", "remove", "block", "unblock"].includes(row.action as string)) throw new Error("Invalid connection action.");
  const action = row.action as ConnectionAction;
  if (action === "send" || action === "block") {
    if (row.expectedId !== undefined) throw new Error("This action does not accept a request identity.");
    return { action };
  }
  return { action, expectedId: parsePlayerId(row.expectedId) };
}
export function parseConnection(value: unknown): Connection {
  const row = object(value);
  if (connectionLists.includes(row.state as ConnectionList)) return { state: row.state as ConnectionList, id: parsePlayerId(row.id) };
  if (["none", "self", "unavailable"].includes(row.state as string) && row.id === null) return { state: row.state as ConnectionState, id: null };
  throw new Error("Invalid relationship state.");
}
export function parseConnectionCursor(time: unknown, id: unknown): ConnectionCursor | null {
  if (time == null && id == null) return null;
  if (typeof time !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/.test(time) || !Number.isFinite(Date.parse(time))) throw new Error("Invalid list position.");
  return { time, id: parsePlayerId(id) };
}
export function parseConnectionItem(value: unknown): ConnectionItem {
  const row = object(value);
  const profile = parseProfileInput({ username: row.username, displayName: row.displayName, bio: "" });
  const cursor = parseConnectionCursor(row.createdAt, row.id);
  if (!cursor) throw new Error("Invalid connection date.");
  return { id: cursor.id, userId: parsePlayerId(row.userId), username: profile.username, displayName: profile.displayName,
    createdAt: cursor.time, state: parseConnectionList(row.state) };
}
