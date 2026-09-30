import type { Bindings } from "../../../config";
import { readConfig } from "../../../config";
import { ApiError } from "../../../errors";
import { serviceKey } from "../../../shared/data/serviceKey";
import { requestClient, unavailable } from "../../accounts/data/supabase";
import type { SessionEnv } from "../../accounts/data/session";
import { parsePlayerId } from "../../../../src/features/friends/domain/connections";
import { publishedMap } from "../../../../src/features/maps/domain/published";
import type { LoadedMap } from "../../../../src/features/maps/data/package";

export function mapFailure(error: { code?: string; message?: string }): ApiError {
  if (error.code === "42501") return new ApiError(403, "access_denied", "This account cannot perform that map action.");
  if (["22023", "22P02", "22007", "22008", "23514"].includes(error.code ?? "")) return new ApiError(400, "invalid_map", "Check the map details.");
  const cases: Record<string, [400 | 404 | 409 | 429, string]> = {
    profile_required: [400, "Create a profile before publishing."], map_unavailable: [404, "This map is unavailable."],
    map_owner_conflict: [409, "This revision already belongs to another publisher."], map_upload_conflict: [409, "This upload ID was used for a different request."],
    map_upload_expired: [409, "This upload expired. Start a new upload."], map_changed: [409, "This map changed. Refresh before trying again."],
    map_rate_limited: [429, "You can start ten map uploads per day."], map_quota: [409, "Your published library reached its 100 revision or 256 MB limit."],
    map_upload_throttled: [429, "Too many upload attempts. Wait a minute before retrying."],
  };
  if (error.code === "23505") return new ApiError(409, "map_owner_conflict", "This revision was published concurrently. Retry to check its owner.");
  const match = error.code === "P0001" && Object.hasOwn(cases, error.message ?? "") ? cases[error.message!] : undefined;
  return match ? new ApiError(match[0], error.message!, match[1]) : unavailable();
}
export async function mapRpc(db: SessionEnv["Variables"]["db"], name: string, args?: Record<string, unknown>) {
  const result = await db.rpc(name, args); if (result.error) throw mapFailure(result.error); return result.data;
}
/** The token must already have passed requireSession; decoded claims alone confer no authority. */
function verifiedSession(token: string, owner: string): string {
  try {
    const claims = JSON.parse(atob(token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (claims.sub !== owner) throw new Error();
    return parsePlayerId(claims.session_id);
  } catch { throw new ApiError(401, "sign_in_required", "Sign in again before publishing."); }
}
export async function completePublication(env: Bindings, token: string, owner: string, id: string, loaded: LoadedMap, sha256: string, bytes: number) {
  const db = requestClient(readConfig(env).url, serviceKey(env)), { set, revision } = loaded;
  const metadata = { setId: set.id, title: set.title, artist: set.artist, author: set.author,
    difficulties: set.difficulties.map(({ name, author, chart }) => ({ id: chart.id, name, author, notes: chart.notes.length, lanes: chart.lanes.length, durationMs: chart.durationMs })) };
  return publishedMap(await mapRpc(db, "complete_map_upload", { p_id: id, p_owner: owner, p_session: verifiedSession(token, owner),
    p_revision: revision, p_metadata: metadata, p_sha256: sha256, p_bytes: bytes }));
}
