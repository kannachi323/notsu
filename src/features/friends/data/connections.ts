import { accountClient, AccountError, authError, configuration } from "../../accounts/data/auth";
import { useAccountStore } from "../../accounts/accountStore";
import { parseConnection, parseConnectionChange, parseConnectionCursor, parseConnectionItem, parseConnectionList, parsePlayerId,
  type ConnectionChange, type ConnectionCursor, type ConnectionList, type ConnectionPage } from "../domain/connections";

async function request(path: string, change?: ConnectionChange, signal?: AbortSignal): Promise<unknown> {
  if (!configuration) throw new AccountError("Online connections are unavailable in this build.");
  const identity = useAccountStore.getState().identity;
  const { data, error } = await accountClient().auth.getSession();
  if (error) throw authError(error);
  if (!identity || !data.session || data.session.user.id !== identity.id || useAccountStore.getState().identity?.id !== identity.id) {
    throw new AccountError("Sign in again to manage your connections.", "sign_in_required");
  }
  let result: Response;
  try {
    result = await fetch(`${configuration.apiUrl}/v1/me/connections${path}`, {
      method: change ? "PUT" : "GET", credentials: "omit", cache: "no-store",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
      headers: { Authorization: `Bearer ${data.session.access_token}`, ...(change ? { "Content-Type": "application/json" } : {}) },
      body: change ? JSON.stringify(change) : undefined,
    });
  } catch { throw new AccountError(change ? "The change could not be confirmed. Refresh before trying again." : "Could not load your connections. Check your connection and retry."); }
  if (useAccountStore.getState().identity?.id !== identity.id) throw new AccountError("Your account changed. Sign in again.");
  let body: { error?: { code?: string } };
  try { body = await result.json(); } catch { throw new AccountError("The connection service returned an unreadable response. Please refresh."); }
  if (useAccountStore.getState().identity?.id !== identity.id) throw new AccountError("Your account changed. Sign in again.");
  if (!result.ok) {
    const code = body?.error?.code ?? "unavailable";
    const messages: Record<string, string> = {
      profile_required: "Create your public profile before connecting with players.",
      connection_changed: "This connection changed. Refresh before trying again.",
      connection_unavailable: "This connection is unavailable.",
      account_unavailable: "Your session is unavailable. Sign out and sign in again.",
      sign_in_required: "Sign in again to manage your connections.",
      request_rate_limited: "You can send 30 new friend requests per hour. Please try later.",
      request_limit: "A player has too many pending requests. Please try later.",
      friend_limit: "A player has reached the 200-friend limit.",
      block_limit: "Your block list has reached its 1,000-player limit.",
    };
    throw new AccountError(Object.hasOwn(messages, code) ? messages[code] : "The connection service could not complete this request. Please refresh.", code);
  }
  return body;
}

export async function getConnection(target: string, signal?: AbortSignal) {
  const body = await request(`/${parsePlayerId(target)}`, undefined, signal) as { connection?: unknown };
  return parseConnection(body?.connection);
}
export async function changeConnection(target: string, value: ConnectionChange) {
  const body = await request(`/${parsePlayerId(target)}`, parseConnectionChange(value)) as { connection?: unknown };
  return parseConnection(body?.connection);
}
export async function listConnections(list: ConnectionList, before?: ConnectionCursor | null, signal?: AbortSignal): Promise<ConnectionPage> {
  const params = new URLSearchParams({ list: parseConnectionList(list) });
  const cursor = parseConnectionCursor(before?.time, before?.id);
  if (cursor) { params.set("beforeTime", cursor.time); params.set("beforeId", cursor.id); }
  const body = await request(`?${params}`, undefined, signal) as { items?: unknown; next?: unknown };
  if (!Array.isArray(body?.items) || body.items.length > 50 || !("next" in body)) throw new AccountError("The connections list could not be read. Please refresh.");
  const items = body.items.map(parseConnectionItem);
  if (items.some(item => item.state !== list) || new Set(items.map(item => item.id)).size !== items.length) throw new AccountError("The connections list was inconsistent. Please refresh.");
  const next = body.next === null ? null : parseConnectionCursor((body.next as ConnectionCursor)?.time, (body.next as ConnectionCursor)?.id);
  if (body.next !== null && (!next || items.length !== 50 || next.id !== items.at(-1)?.id || next.time !== items.at(-1)?.createdAt)) throw new AccountError("The next page could not be read. Please refresh.");
  return { items, next };
}
