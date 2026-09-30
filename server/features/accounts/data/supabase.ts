import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Profile } from "../../../../src/features/accounts/domain/profile";
import { ApiError } from "../../../errors";

export function requestClient(url: string, key: string, token?: string) {
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      fetch: (input, init) => fetch(input, {
        ...init,
        signal: init?.signal
          ? AbortSignal.any([init.signal, AbortSignal.timeout(5000)])
          : AbortSignal.timeout(5000),
      }),
    },
  });
}

export async function requireAccount(client: SupabaseClient, token: string) {
  const { data, error } = await client.auth.getUser(token);
  if (error) {
    if (!error.status || error.status >= 500 || error.status === 429) throw unavailable();
    throw new ApiError(401, "sign_in_required", "Sign in again to continue.");
  }
  const user = data.user;
  if (!user || user.role !== "authenticated") {
    throw new ApiError(401, "sign_in_required", "Sign in again to continue.");
  }
  if (!user.email_confirmed_at || !user.email || user.is_anonymous) {
    throw new ApiError(403, "verification_required", "Verify your email to continue.");
  }
  const active = await client.rpc("account_is_active");
  if (active.error) throw databaseError(active.error.code);
  if (active.data !== true) {
    throw new ApiError(403, "account_unavailable", "This account session is no longer available. Sign in again.");
  }
  return user.id;
}

export function databaseError(code: string) {
  if (code === "23505") return new ApiError(409, "username_taken", "That username is already taken.");
  if (code === "23514" || code === "22001" || code === "22P02" || code === "23502") {
    return new ApiError(400, "invalid_profile", "Check your username, display name and bio.");
  }
  if (code === "42501") return new ApiError(403, "access_denied", "This action is not available for this account.");
  if (code === "PGRST301" || code === "PGRST303") {
    return new ApiError(401, "sign_in_required", "Sign in again to continue.");
  }
  return unavailable();
}

export function unavailable() {
  return new ApiError(503, "service_unavailable", "Online services are temporarily unavailable. Try again.");
}

export const profileColumns = "id,username,display_name,bio,created_at,updated_at";

export function toProfile(row: Record<string, unknown>): Profile {
  const fields = ["id", "username", "display_name", "bio", "created_at", "updated_at"] as const;
  if (fields.some((field) => typeof row[field] !== "string")) throw unavailable();
  return {
    id: row.id as string, username: row.username as string, displayName: row.display_name as string,
    bio: row.bio as string, createdAt: row.created_at as string, updatedAt: row.updated_at as string,
  };
}
