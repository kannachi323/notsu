import { createClient, type AuthError, type SupabaseClient } from "@supabase/supabase-js";
import { acceptIdentity, useAccountStore } from "../accountStore";
import { onlineConfig } from "./config";

export class AccountError extends Error {
  constructor(message: string, public code = "unavailable") { super(message); }
}
export function authError(error: AuthError): AccountError {
  const code = error.code ?? "unavailable";
  const messages: Record<string, string> = {
    invalid_credentials: "The email or password is incorrect.",
    email_not_confirmed: "Verify your email before signing in.",
    user_banned: "This account is unavailable.",
    otp_expired: "That code is invalid or expired. Request a new code and try again.",
    over_email_send_rate_limit: "Please wait before requesting another email.",
    over_request_rate_limit: "Too many attempts. Please wait and try again.",
    weak_password: "Choose a stronger password of at least 12 characters.",
    same_password: "Choose a different password from your current one.",
    reauthentication_needed: "Sign in again before changing your password.",
    session_not_found: "Your session has ended. Sign in again.",
    user_already_exists: "Check your email, or try signing in if you already have an account.",
    email_address_invalid: "Enter a valid email address.",
  };
  return new AccountError(Object.hasOwn(messages, code) ? messages[code] : "The account service could not complete this request. Check your connection and try again.", code);
}

export const configuration = onlineConfig(import.meta.env);
let client: SupabaseClient | undefined;
let unsubscribe: (() => void) | undefined;

export function accountClient() {
  if (!configuration) throw new AccountError("Accounts are not available in this build.");
  if (!client) {
    client = createClient(configuration.authUrl, configuration.key, {
      auth: { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false, storageKey: `notsu-session-${crypto.randomUUID()}` },
      global: { fetch: (input, init) => fetch(input, { ...init,
        signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
      }) },
    });
    const { data } = client.auth.onAuthStateChange((event, session) => {
      // Synchronous: calling another Auth method here can deadlock the SDK lock.
      const user = session?.user;
      acceptIdentity(user?.email ? { id: user.id, email: user.email } : null,
        event === "PASSWORD_RECOVERY" || (!!session && useAccountStore.getState().identity?.id === user?.id && useAccountStore.getState().recovery));
    });
    unsubscribe = () => data.subscription.unsubscribe();
  }
  return client;
}

export async function signOut() {
  const { error } = await accountClient().auth.signOut({ scope: "local" });
  if (error) throw authError(error);
  acceptIdentity(null);
}

/** The server has deleted this identity. Drop the in-memory SDK session without another network request. */
export async function forgetDeletedAccount(userId: string) {
  if (useAccountStore.getState().identity?.id !== userId) return;
  unsubscribe?.(); unsubscribe = undefined;
  const previous = client;
  client = undefined;
  acceptIdentity(null);
  try { await previous?.auth.dispose(); } catch { /* Confirmed deletion is not undone by local cleanup failure. */ }
}

if (import.meta.hot) import.meta.hot.dispose(() => {
  unsubscribe?.();
  void client?.auth.dispose();
  acceptIdentity(null);
});
