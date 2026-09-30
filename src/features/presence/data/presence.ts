import { accountClient, AccountError, authError, configuration } from "../../accounts/data/auth";
import { useAccountStore } from "../../accounts/accountStore";
import { ownPresence, presenceInput, presenceTargets, friendPresence, visibility, visibilityInput, snapshot, type PresenceInput, type Visibility } from "../domain/presence";

async function request(path: string, body?: unknown, signal?: AbortSignal, keepalive = false, expectedUser?: string): Promise<unknown> {
  if (!configuration) throw new AccountError("Online status is unavailable in this build.");
  const identity = useAccountStore.getState().identity;
  const { data, error } = await accountClient().auth.getSession();
  if (error) throw authError(error);
  const current = () => !!identity && identity.id === useAccountStore.getState().identity?.id && identity.id === data.session?.user.id && (!expectedUser || expectedUser === identity.id);
  if (!current()) throw new AccountError("Sign in again to update online status.", "sign_in_required");
  let response: Response;
  try {
    response = await fetch(`${configuration.apiUrl}/v1/me/presence${path}`, { method: body ? "PUT" : "GET", credentials: "omit", cache: "no-store", keepalive,
      headers: { Authorization: `Bearer ${data.session!.access_token}`, ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000) });
  } catch { throw new AccountError("Online status could not sync. Your last confirmed setting is shown."); }
  if (!current()) throw new AccountError("Your account changed. Sign in again.");
  let value: unknown;
  try { value = await response.json(); } catch { throw new AccountError("Online status could not be read."); }
  if (!current()) throw new AccountError("Your account changed. Sign in again.");
  if (!response.ok) {
    const code = (value as { error?: { code?: unknown } })?.error?.code;
    const text: Record<string, string> = { profile_required: "Create your profile before sharing online status.", presence_rate_limited: "Too many status updates. Please wait a moment.", presence_window_limit: "Too many recent app windows. Close unused windows and try again in five minutes.", account_unavailable: "Your session has ended. Sign out and sign in again.", sign_in_required: "Sign in again to update online status." };
    throw new AccountError(typeof code === "string" && Object.hasOwn(text, code) ? text[code] : "Online status is temporarily unavailable.", typeof code === "string" ? code : "unavailable");
  }
  return value;
}
export async function renewPresence(userId: string, value: PresenceInput, keepalive = false) { return ownPresence(await request("", presenceInput(value), undefined, keepalive, userId)); }
export async function setVisibility(userId: string, value: Visibility) {
  const result = await request("/settings", { visibility: visibilityInput({ visibility: value }) }, undefined, false, userId) as { visibility?: unknown };
  return visibility(result?.visibility);
}
async function loadPresenceBatch(players: string[], signal?: AbortSignal) {
  const targets = presenceTargets(players), started = performance.now();
  const result = await request(`?players=${targets.join(",")}`, undefined, signal) as { items?: unknown };
  if (!Array.isArray(result?.items) || result.items.length !== targets.length) throw new AccountError("Online status could not be read.");
  const items = result.items.map(friendPresence);
  if (new Set(items.map(item => item.userId)).size !== targets.length || items.some(item => !targets.includes(item.userId))) throw new AccountError("Online status did not match these players.");
  return snapshot(items, started, performance.now());
}
/** Lists accumulate pages, while each server lookup stays within its 50-player cap. */
export async function loadFriendPresence(players: string[], signal?: AbortSignal) {
  if (players.length < 1 || players.length > 200 || new Set(players).size !== players.length) throw new AccountError("Invalid friend list.");
  const batches = Array.from({ length: Math.ceil(players.length / 50) }, (_, index) => presenceTargets(players.slice(index * 50, index * 50 + 50)));
  return (await Promise.all(batches.map(batch => loadPresenceBatch(batch, signal)))).flat();
}
