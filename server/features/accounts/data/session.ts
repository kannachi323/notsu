import type { SupabaseClient } from "@supabase/supabase-js";
import { createMiddleware } from "hono/factory";
import { readConfig, type Bindings } from "../../../config";
import { ApiError } from "../../../errors";
import { requestClient, requireAccount } from "./supabase";

export type SessionEnv = { Bindings: Bindings; Variables: { db: SupabaseClient; userId: string } };

export const requireSession = createMiddleware<SessionEnv>(async (c, next) => {
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
