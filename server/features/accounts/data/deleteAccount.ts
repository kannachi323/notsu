import { ApiError } from "../../../errors";
import { readConfig, type Bindings } from "../../../config";
import { requestClient } from "./supabase";

/** Only call AFTER requireAccount has verified this exact token with Auth and the live session. */
export function requireRecentPassword(verifiedToken: string, userId: string, nowSeconds = Date.now() / 1000) {
  try {
    const payload = verifiedToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(atob(payload));
    if (claims.sub === userId && Array.isArray(claims.amr) && claims.amr.some((entry: unknown) => {
      if (!entry || typeof entry !== "object") return false;
      const proof = entry as Record<string, unknown>;
      return proof.method === "password" && typeof proof.timestamp === "number" &&
        Number.isSafeInteger(proof.timestamp) && proof.timestamp >= nowSeconds - 120 && proof.timestamp <= nowSeconds + 5;
    })) return;
  } catch { /* Missing or malformed claims never establish recent authentication. */ }
  throw new ApiError(403, "reauthentication_required", "Confirm your current password and try again.");
}

function adminKey(env: Bindings) {
  const key = env.SUPABASE_SECRET_KEY;
  let privileged = typeof key === "string" && /^sb_secret_[A-Za-z0-9_-]+$/.test(key);
  if (!privileged && typeof key === "string" && key.split(".").length === 3) {
    try { privileged = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role"; }
    catch { /* Local legacy keys must explicitly be service_role. */ }
  }
  if (!privileged || !key) throw new ApiError(503, "deletion_unavailable", "Account deletion is temporarily unavailable. Please try later.");
  return key;
}

/** No caller-selected ID or general admin client escapes this narrow adapter. */
export async function deleteAuthenticatedAccount(env: Bindings, verifiedUserId: string) {
  const { url } = readConfig(env);
  const client = requestClient(url, adminKey(env));
  const { error } = await client.auth.admin.deleteUser(verifiedUserId, false);
  if (!error || error.code === "user_not_found") return;
  // A timeout may hide a completed deletion. Confirm absence before reporting success;
  // do not blindly repeat a destructive request or treat an outage as absence.
  const checked = await client.auth.admin.getUserById(verifiedUserId);
  if (checked.error?.code === "user_not_found") return;
  throw new ApiError(503, "deletion_unconfirmed", "Deletion could not be confirmed. Check your connection and try signing in again.");
}
