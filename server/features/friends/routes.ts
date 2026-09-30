import { Hono } from "hono";
import type { SessionEnv } from "../accounts/data/session";
import { readJsonBody } from "../../shared/data/requestBody";
import { ApiError } from "../../errors";
import { parseConnection, parseConnectionChange, parseConnectionCursor, parseConnectionItem, parseConnectionList, parsePlayerId } from "../../../src/features/friends/domain/connections";
import { unavailable } from "../accounts/data/supabase";

export const friends = new Hono<SessionEnv>();

function input<T>(parse: () => T): T {
  try { return parse(); }
  catch { throw new ApiError(400, "invalid_connection", "Check the player, action and list position."); }
}
function failure(error: { code?: string; message?: string }) {
  if (error.code === "42501") return new ApiError(403, "account_unavailable", "Sign in again to manage your connections.");
  if (["22023", "22P02", "22007", "22008"].includes(error.code ?? "")) return new ApiError(400, "invalid_connection", "Check the request details.");
  const cases: Record<string, [400 | 403 | 409 | 429, string]> = {
    profile_required: [400, "Create your public profile before connecting with players."],
    connection_unavailable: [403, "This connection is unavailable."],
    connection_changed: [409, "This connection changed. Refresh before trying again."],
    friend_limit: [409, "A player has reached the 200-friend limit."],
    request_limit: [429, "A player has too many pending requests. Please try later."],
    request_rate_limited: [429, "You can send 30 new friend requests per hour. Please try later."],
    block_limit: [409, "Your block list has reached its 1,000-player limit."],
  };
  const known = error.code === "P0001" && Object.hasOwn(cases, error.message ?? "") ? cases[error.message!] : undefined;
  return known ? new ApiError(known[0], error.message!, known[1]) : unavailable();
}

friends.get("/me/connections", async (c) => {
  const list = input(() => parseConnectionList(c.req.query("list") ?? "friends"));
  const cursor = input(() => parseConnectionCursor(c.req.query("beforeTime"), c.req.query("beforeId")));
  const result = await c.get("db").rpc("list_connections", { p_list: list, p_before_time: cursor?.time ?? null, p_before_id: cursor?.id ?? null });
  if (result.error) throw failure(result.error);
  if (!Array.isArray(result.data) || result.data.length > 51) throw unavailable();
  const items = result.data.slice(0, 50).map(row => parseConnectionItem({ id: row.id, userId: row.user_id,
    username: row.username, displayName: row.display_name, createdAt: row.created_at, state: row.state }));
  if (items.some(item => item.state !== list)) throw unavailable();
  const last = items.at(-1);
  return c.json({ items, next: result.data.length > 50 && last ? { time: last.createdAt, id: last.id } : null });
});

friends.get("/me/connections/:target", async (c) => {
  const target = input(() => parsePlayerId(c.req.param("target")));
  const result = await c.get("db").rpc("get_connection", { p_target: target });
  if (result.error) throw failure(result.error);
  return c.json({ connection: parseConnection(result.data) });
});

friends.put("/me/connections/:target", async (c) => {
  const target = input(() => parsePlayerId(c.req.param("target")));
  if (c.req.header("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ApiError(415, "json_required", "Send connection details as JSON.");
  const body = await readJsonBody(c.req.raw);
  const change = input(() => parseConnectionChange(body));
  const result = await c.get("db").rpc("change_connection", { p_target: target, p_action: change.action, p_expected_id: change.expectedId ?? null });
  if (result.error) throw failure(result.error);
  return c.json({ connection: parseConnection(result.data) });
});
