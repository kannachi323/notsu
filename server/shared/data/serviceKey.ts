import { ApiError } from "../../errors";
import type { Bindings } from "../../config";

/** Call only inside narrowly scoped, authenticated server adapters. */
export function serviceKey(env: Bindings): string {
  const key = env.SUPABASE_SECRET_KEY;
  let privileged = typeof key === "string" && /^sb_secret_[A-Za-z0-9_-]+$/.test(key);
  if (!privileged && typeof key === "string" && key.split(".").length === 3) {
    try { privileged = JSON.parse(atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role"; }
    catch { /* Fail closed without logging credentials. */ }
  }
  if (!privileged || !key) throw new ApiError(503, "service_unavailable", "This online service is temporarily unavailable.");
  return key;
}
