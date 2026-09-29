import type { Profile, ProfileInput } from "../domain/profile";
import { parseProfileInput } from "../domain/profile";
import { accountClient, AccountError, authError, configuration } from "./auth";
import { useAccountStore } from "../accountStore";

export function readProfile(value: unknown): Profile {
  if (!value || typeof value !== "object") throw new AccountError("The profile could not be read. Try again.");
  const row = value as Record<string, unknown>;
  if (typeof row.id !== "string" || typeof row.createdAt !== "string" || typeof row.updatedAt !== "string") {
    throw new AccountError("The profile could not be read. Try again.");
  }
  const fields = parseProfileInput({ username: row.username, displayName: row.displayName, bio: row.bio });
  return { ...fields, id: row.id, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

async function profileRequest(body?: ProfileInput) {
  const payload = body ? JSON.stringify(parseProfileInput(body)) : undefined;
  const { data, error } = await accountClient().auth.getSession();
  if (error) throw authError(error);
  if (!data.session) throw new AccountError("Sign in again to continue.", "sign_in_required");
  let response: Response;
  try {
    response = await fetch(`${configuration!.apiUrl}/v1/me/profile`, {
      method: body ? "PUT" : "GET", credentials: "omit", cache: "no-store", signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: payload,
    });
  } catch { throw new AccountError("Could not reach your profile. Check your connection and retry."); }
  if (!response.ok) {
    if (response.status === 409) throw new AccountError("That username is already taken. Choose another.", "username_taken");
    if ([401, 403].includes(response.status)) throw new AccountError("Your account session is unavailable. Sign out and sign in again.", "sign_in_required");
    if (response.status === 400) throw new AccountError("Check your username, display name and bio.");
    throw new AccountError("Could not load or save your profile. Please retry.");
  }
  let result: { profile?: unknown };
  try { result = await response.json() as { profile?: unknown }; }
  catch { throw new AccountError("The profile service returned an unreadable response. Please retry."); }
  if (!result || typeof result !== "object") throw new AccountError("The profile response was incomplete. Please retry.");
  return result.profile === null ? null : readProfile(result.profile);
}

let loadVersion = 0;
export async function loadOwnProfile() {
  const identity = useAccountStore.getState().identity;
  if (!identity) return;
  const version = ++loadVersion;
  useAccountStore.setState({ profileStatus: "loading", profileError: "" });
  try {
    const profile = await profileRequest();
    if (useAccountStore.getState().identity?.id !== identity.id || version !== loadVersion) return;
    if (profile && profile.id !== identity.id) throw new AccountError("The profile did not match your account.");
    useAccountStore.setState({ profile, profileStatus: "ready" });
  } catch (error) {
    if (useAccountStore.getState().identity?.id !== identity.id || version !== loadVersion) return;
    useAccountStore.setState({ profileStatus: "error", profileError: error instanceof Error ? error.message : "Could not load your profile." });
  }
}

export async function saveOwnProfile(input: ProfileInput) {
  const identity = useAccountStore.getState().identity;
  ++loadVersion;
  const profile = await profileRequest(input);
  if (!identity || useAccountStore.getState().identity?.id !== identity.id) throw new AccountError("Your account changed. Sign in again.");
  if (!profile || profile.id !== identity.id) throw new AccountError("The saved profile could not be confirmed. Reload and check before retrying.");
  useAccountStore.setState({ profile, profileStatus: "ready", profileError: "" });
  return profile;
}
