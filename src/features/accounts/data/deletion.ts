import { createClient } from "@supabase/supabase-js";
import { useAccountStore } from "../accountStore";
import { AccountError, authError, configuration, forgetDeletedAccount } from "./auth";

export async function deleteOwnAccount(password: string, confirmation: string) {
  const identity = useAccountStore.getState().identity;
  if (!configuration || !identity) throw new AccountError("Sign in before deleting your account.");
  if (confirmation !== "DELETE") throw new AccountError("Type DELETE to confirm permanent account deletion.");
  if (!password || password.length > 128) throw new AccountError("Enter your current password.");
  // A separate, temporary session proves the current password without replacing the
  // app's session or accidentally signing the UI into a different identity.
  const proof = createClient(configuration.authUrl, configuration.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `notsu-delete-${crypto.randomUUID()}` },
    global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }) },
  });
  let deleted = false;
  try {
    const { data, error } = await proof.auth.signInWithPassword({ email: identity.email, password });
    if (error) throw authError(error);
    if (!data.session || data.user?.id !== identity.id || useAccountStore.getState().identity?.id !== identity.id) {
      throw new AccountError("Your account changed. Sign in again before continuing.");
    }
    let result: Response;
    try {
      result = await fetch(`${configuration.apiUrl}/v1/me/account`, {
        method: "DELETE", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(20000),
        headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
    } catch { throw new AccountError("Deletion could not be confirmed. Check your connection, then sign in again to check your account.", "deletion_unconfirmed"); }
    if (result.status !== 204) {
      if ([401, 403].includes(result.status)) throw new AccountError("Your password confirmation expired or your account is unavailable. Sign in again.");
      throw new AccountError("Deletion could not be confirmed. Please try signing in again before retrying.", "deletion_unconfirmed");
    }
    deleted = true;
    await forgetDeletedAccount(identity.id);
  } finally {
    // Best-effort revoke the temporary session after a failed attempt. Cleanup failures
    // never turn an uncertain deletion into success or hide the original error.
    if (!deleted) { try { await proof.auth.signOut({ scope: "local" }); } catch { /* The two-minute password-proof limit still applies. */ } }
    try { await proof.auth.dispose(); } catch { /* Do not replace the operation's result with cleanup errors. */ }
  }
}
