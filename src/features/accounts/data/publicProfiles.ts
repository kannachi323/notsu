import { parseUsername } from "../domain/profile";
import { AccountError, configuration } from "./auth";
import { readProfile } from "./profiles";

export async function loadPublicProfile(username: string, signal?: AbortSignal) {
  const handle = parseUsername(username);
  if (!configuration) throw new AccountError("Online player profiles are unavailable in this build.");
  let result: Response;
  try {
    result = await fetch(`${configuration.apiUrl}/v1/profiles/${encodeURIComponent(handle)}`, {
      credentials: "omit", cache: "no-store",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(8000)]) : AbortSignal.timeout(8000),
    });
  } catch { throw new AccountError("Could not reach this player. Check your connection and retry."); }
  if (result.status === 404) throw new AccountError("No player has this username. Check the spelling or try another name.", "not_found");
  if (!result.ok) throw new AccountError("Player profiles are temporarily unavailable. Please retry.");
  try {
    const body = await result.json() as { profile?: unknown };
    const profile = readProfile(body?.profile);
    if (profile.username !== handle) throw new Error("Mismatched profile");
    return profile;
  } catch { throw new AccountError("This profile could not be read. Please retry."); }
}
