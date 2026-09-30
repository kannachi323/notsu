import { Hono } from "hono";
import { parseProfileInput, parseUsername } from "../../../src/features/accounts/domain/profile";
import { readConfig } from "../../config";
import { ApiError } from "../../errors";
import { databaseError, profileColumns, requestClient, toProfile } from "./data/supabase";
import { readJsonBody } from "../../shared/data/requestBody";
import type { SessionEnv } from "./data/session";
import { deleteAuthenticatedAccount, requireRecentPassword } from "./data/deleteAccount";

export const accounts = new Hono<SessionEnv>();

accounts.get("/profiles/:username", async (c) => {
  let username: string;
  try { username = parseUsername(c.req.param("username")); }
  catch { throw new ApiError(400, "invalid_username", "Enter a valid username."); }
  const { url, key } = readConfig(c.env);
  const { data, error } = await requestClient(url, key).from("profiles")
    .select(profileColumns).eq("username", username).maybeSingle();
  if (error) throw databaseError(error.code);
  if (!data) throw new ApiError(404, "profile_not_found", "This profile was not found.");
  return c.json({ profile: toProfile(data) });
});

accounts.get("/me/profile", async (c) => {
  const { data, error } = await c.get("db").from("profiles").select(profileColumns)
    .eq("id", c.get("userId")).maybeSingle();
  if (error) throw databaseError(error.code);
  return c.json({ profile: data ? toProfile(data) : null });
});

accounts.put("/me/profile", async (c) => {
  if (c.req.header("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "json_required", "Send profile details as JSON.");
  }
  let input;
  try { input = parseProfileInput(await readJsonBody(c.req.raw)); }
  catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, "invalid_profile", error instanceof SyntaxError
      ? "Send valid profile details." : error instanceof Error ? error.message : "Check your profile details.");
  }
  const { data, error } = await c.get("db").rpc("save_profile", {
    p_username: input.username, p_display_name: input.displayName, p_bio: input.bio,
  });
  if (error) throw databaseError(error.code);
  if (!data || typeof data !== "object") throw databaseError("");
  return c.json({ profile: toProfile(data) });
});

accounts.delete("/me/account", async (c) => {
  if (c.req.header("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new ApiError(415, "json_required", "Send confirmation as JSON.");
  }
  const input = await readJsonBody(c.req.raw);
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      Object.keys(input).length !== 1 || !("confirmation" in input) || input.confirmation !== "DELETE") {
    throw new ApiError(400, "confirmation_required", "Type DELETE to confirm permanent account deletion.");
  }
  requireRecentPassword(c.req.header("Authorization")!.slice(7), c.get("userId"));
  await deleteAuthenticatedAccount(c.env, c.get("userId"));
  return c.body(null, 204);
});
