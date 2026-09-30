import { Hono } from "hono";
import type { SessionEnv } from "../accounts/data/session";
import { ApiError } from "../../errors";
import { readJsonBody } from "../../shared/data/requestBody";
import { unavailable } from "../accounts/data/supabase";
import { presenceInput, presenceTargets, visibilityInput, visibility, ownPresence, friendPresence } from "../../../src/features/presence/domain/presence";

export const presence = new Hono<SessionEnv>();
function input<T>(parse: () => T): T { try { return parse(); } catch { throw new ApiError(400, "invalid_presence", "Check the online status details."); } }
function failure(error: { code?: string; message?: string }) {
  if (error.code === "42501") return new ApiError(403, "account_unavailable", "Sign in again to update your status.");
  if (["22023", "22P02", "22003"].includes(error.code ?? "")) return new ApiError(400, "invalid_presence", "Check the online status details.");
  if (error.code === "P0001") {
    if (error.message === "profile_required") return new ApiError(400, error.message, "Create your profile before sharing online status.");
    if (error.message === "presence_rate_limited") return new ApiError(429, error.message, "Too many status updates. Please wait a moment.");
    if (error.message === "presence_window_limit") return new ApiError(429, error.message, "Too many recent app windows. Close unused windows and try again in five minutes.");
  }
  return unavailable();
}
presence.get("/me/presence/settings", async c => {
  const { data, error } = await c.get("db").rpc("get_presence_settings");
  if (error) throw failure(error);
  return c.json({ visibility: visibility(data?.visibility) });
});
presence.put("/me/presence/settings", async c => {
  if (c.req.header("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ApiError(415, "json_required", "Send visibility as JSON.");
  const raw = await readJsonBody(c.req.raw), mode = input(() => visibilityInput(raw));
  const { data, error } = await c.get("db").rpc("set_presence_visibility", { p_visibility: mode });
  if (error) throw failure(error);
  return c.json({ visibility: visibility(data?.visibility) });
});
presence.put("/me/presence", async c => {
  if (c.req.header("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") throw new ApiError(415, "json_required", "Send status as JSON.");
  const raw = await readJsonBody(c.req.raw), update = input(() => presenceInput(raw));
  const { data, error } = await c.get("db").rpc("renew_presence", { p_client: update.clientId, p_sequence: update.sequence, p_visible: update.visible });
  if (error) throw failure(error);
  return c.json(ownPresence(data));
});
presence.get("/me/presence", async c => {
  const targets = input(() => presenceTargets(c.req.query("players")?.split(",")));
  const { data, error } = await c.get("db").rpc("friend_presence", { p_targets: targets });
  if (error) throw failure(error);
  if (!Array.isArray(data) || data.length !== targets.length) throw unavailable();
  const items = data.map(row => friendPresence({ userId: row.user_id, online: row.online, validForMs: row.valid_for_ms }));
  if (new Set(items.map(item => item.userId)).size !== targets.length || items.some(item => !targets.includes(item.userId))) throw unavailable();
  return c.json({ items });
});
