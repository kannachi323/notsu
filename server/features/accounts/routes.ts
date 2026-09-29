import { Hono } from "hono";
import type { SupabaseClient } from "@supabase/supabase-js";
import { parseProfileInput, parseUsername } from "../../../src/features/accounts/domain/profile";
import type { Bindings } from "../../config";
import { readConfig } from "../../config";
import { ApiError } from "../../errors";
import { databaseError, profileColumns, requestClient, requireAccount, toProfile } from "./data/supabase";
import { readProfileBody } from "./data/profileBody";

type AccountEnv = { Bindings: Bindings; Variables: { db: SupabaseClient; userId: string } };
export const accounts = new Hono<AccountEnv>();

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

accounts.use("/me/*", async (c, next) => {
  const header = c.req.header("Authorization") ?? "";
  if (header.length > 8192 || !/^Bearer [A-Za-z0-9._-]+$/i.test(header)) {
    throw new ApiError(401, "sign_in_required", "Sign in to continue.");
  }
  const token = header.slice(7);
  const { url, key } = readConfig(c.env);
  const client = requestClient(url, key, token);
  c.set("userId", await requireAccount(client, token));
  c.set("db", client);
  await next();
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
  try { input = parseProfileInput(await readProfileBody(c.req.raw)); }
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
