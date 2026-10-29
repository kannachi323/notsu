import { accountClient, AccountError, authError, configuration } from "../../accounts/data/auth";
import { useAccountStore } from "../../accounts/accountStore";
import { mapCursor, mapHash, ONLINE_MAP_BYTES, ONLINE_CHART_BYTES, publishedMap, publishedPage } from "../domain/published";
import type { MapCursor, PublishedMap } from "../domain/published";
import { mapObject } from "../domain/mapSet";
import { mapJob } from "./packageClient";
import type { LoadedMap } from "./package";
import { parsePlayerId } from "../../friends/domain/connections";

const errors: Record<string,string> = {
  map_unavailable:"This map is no longer available.", map_changed:"This revision changed. Refresh your publications before trying again.",
  map_owner_conflict:"This revision belongs to another publisher.", map_upload_conflict:"This upload ID belongs to another request. Choose the pack again.",
  map_upload_expired:"The upload expired. Choose the pack again to start a new upload.", map_quota:"Your published library reached its 100 revision or 256 MB limit.",
  map_rate_limited:"You can publish ten new revisions per day. Try again later.", map_upload_throttled:"Too many uploads. Wait a minute and retry.",
  profile_required:"Create your public profile before publishing.", access_denied:"This account cannot perform that map action.",
  verification_required:"Verify your email before publishing.", account_unavailable:"Your session ended. Sign in again.",
  sign_in_required:"Sign in again before publishing.", invalid_map:"The pack cannot be published. Check its difficulties and recording in the editor.",
  upload_busy:"The upload service is busy. Retry the same pack shortly.", maps_unavailable:"Online map storage is unavailable. Try again later.",
};
function currentAccount(id: string) { if (useAccountStore.getState().identity?.id !== id) throw new AccountError("Your account changed. Sign in again."); }
async function request(path: string, init: RequestInit = {}, signal?: AbortSignal): Promise<Response> {
  if (!configuration) throw new AccountError("Online maps are unavailable in this build. Included and imported maps are playable offline.");
  let identity: string | undefined;
  const headers = new Headers(init.headers);
  if (path.startsWith("/me/")) {
    identity = useAccountStore.getState().identity?.id;
    const { data,error } = await accountClient().auth.getSession();
    if (error) throw authError(error);
    if (!identity || !data.session || data.session.user.id !== identity) throw new AccountError("Sign in before publishing.","sign_in_required");
    currentAccount(identity); headers.set("Authorization",`Bearer ${data.session.access_token}`);
  }
  const deadline = AbortSignal.timeout(init.method === "PUT" ? 60000 : 30000);
  let response: Response;
  try {
    response = await fetch(`${configuration.apiUrl}/v1${path}`,{ ...init,headers,credentials:"omit",cache:"no-store",signal:signal ? AbortSignal.any([signal,deadline]) : deadline });
  } catch {
    throw new AccountError(init.method === "PUT" ? "The change could not be confirmed. Refresh or retry the same request." : "Could not reach the map service. Check your connection and retry.");
  }
  if (identity) currentAccount(identity);
  if (!response.ok) {
    let code = "unavailable";
    try { const body = JSON.parse(new TextDecoder().decode(await boundedBytes(response,4096))); if (typeof body?.error?.code === "string") code = body.error.code; } catch { /* Provider errors need not be JSON. */ }
    throw new AccountError(errors[code] ?? "The map service could not complete this request. Please retry.",code);
  }
  return response;
}
export async function boundedBytes(response: Response, max: number): Promise<Uint8Array> {
  const size = response.headers.get("Content-Length");
  if (size !== null && (!/^\d+$/.test(size) || Number(size)>max)) { void response.body?.cancel(); throw new Error("The map response exceeds its size limit."); }
  if (!response.body) throw new Error("The map response was empty.");
  const reader = response.body.getReader(), chunks:Uint8Array[] = []; let total = 0;
  try {
    while (true) { const part = await reader.read(); if (part.done) break; total += part.value.length;
      if (total>max) { await reader.cancel(); throw new Error("The map response exceeds its size limit."); } chunks.push(part.value); }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(total); let offset=0; for (const chunk of chunks) { bytes.set(chunk,offset); offset+=chunk.length; } return bytes;
}
async function json(path:string, init:RequestInit = {}, signal?:AbortSignal): Promise<unknown> {
  const owner = path.startsWith("/me/") ? useAccountStore.getState().identity?.id : undefined;
  const response = await request(path,init,signal);
  let value: unknown;
  try { value = JSON.parse(new TextDecoder("utf-8",{ fatal:true }).decode(await boundedBytes(response,path === "/me/maps" ? 4*1024*1024 : 1024*1024))); }
  catch { throw new AccountError("The map service returned an unreadable response. Refresh and retry."); }
  if (owner) currentAccount(owner); return value;
}
export async function listOnlineMaps(query:string, before:MapCursor|null = null, signal?:AbortSignal) {
  if (query.length>80) throw new Error("Search with up to 80 characters.");
  const params = new URLSearchParams({ q:query }), cursor = mapCursor(before?.time,before?.revision);
  if (cursor) { params.set("beforeTime",cursor.time); params.set("beforeRevision",cursor.revision); }
  return publishedPage(await json(`/maps?${params}`,{},signal));
}
export async function ownOnlineMaps(signal?:AbortSignal): Promise<PublishedMap[]> {
  const owner = useAccountStore.getState().identity?.id, body = mapObject(await json("/me/maps",{},signal));
  if (!Array.isArray(body.items) || body.items.length>100) throw new Error("Your publications could not be read. Refresh and retry.");
  const items = body.items.map(publishedMap);
  if (items.some(item => item.publisherId !== owner) || new Set(items.map(item=>item.revision)).size !== items.length) throw new Error("Your publications were inconsistent. Refresh and retry.");
  return items;
}
export async function downloadOnlineMap(map:PublishedMap, signal?:AbortSignal): Promise<{ loaded:LoadedMap; bytes:Uint8Array }> {
  const checked = publishedMap(map), response = await request(`/maps/${checked.revision}/pack`,{},signal);
  const bytes = await boundedBytes(response,ONLINE_MAP_BYTES);
  const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new Uint8Array(bytes))),byte=>byte.toString(16).padStart(2,"0")).join("");
  if (bytes.length !== checked.bytes || hash !== checked.archiveSha256) throw new Error("The downloaded pack failed its fingerprint check. Please retry.");
  const loaded = await mapJob<LoadedMap>({ action:"unpack",bytes,limits:{ maxBytes:ONLINE_MAP_BYTES,maxChartBytes:ONLINE_CHART_BYTES } });
  if (loaded.revision !== checked.revision) throw new Error("The downloaded map does not match this revision.");
  return { loaded,bytes };
}
export async function publishOnlineMap(revision:string, bytes:Uint8Array, uploadId:string): Promise<PublishedMap> {
  if (bytes.length<22 || bytes.length>ONLINE_MAP_BYTES) throw new Error("Online packs must be at most 16 MB.");
  const body = await json(`/me/maps/${mapHash(revision)}?uploadId=${parsePlayerId(uploadId)}&rights=confirmed`,{ method:"PUT",headers:{ "Content-Type":"application/octet-stream" },body:new Uint8Array(bytes) });
  const result = publishedMap(body);
  if (result.revision !== revision) throw new Error("Publication returned a different revision. Refresh before retrying.");
  return result;
}
export async function setOnlineVisibility(map:PublishedMap, visible:boolean): Promise<PublishedMap> {
  const result = publishedMap(await json(`/me/maps/${mapHash(map.revision)}/visibility`,{ method:"PUT",headers:{ "Content-Type":"application/json" },body:JSON.stringify({ version:map.version,visible }) }));
  if (result.revision !== map.revision) throw new Error("The service returned a different revision. Refresh before retrying.");
  return result;
}
