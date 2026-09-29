import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadPublicProfile } from "./publicProfiles";
vi.mock("./auth", () => ({ configuration: { apiUrl: "https://api.test" },
  AccountError: class extends Error { constructor(message: string, public code = "unavailable") { super(message); } },
}));
const profile = { id: "player", username: "player_one", displayName: "<script>Text only</script>", bio: "Hello", createdAt: "2026-01-01", updatedAt: "2026-01-01" };
describe("public profile loading", () => {
  const fetcher = vi.fn<typeof fetch>();
  beforeEach(() => { vi.stubGlobal("fetch", fetcher); fetcher.mockResolvedValue(Response.json({ profile })); });
  afterEach(() => { vi.unstubAllGlobals(); fetcher.mockReset(); });
  it("normalizes the handle without sending a private session or cookies", async () => {
    expect(await loadPublicProfile(" PLAYER_ONE ")).toEqual(profile);
    expect(fetcher.mock.calls[0]).toMatchObject(["https://api.test/v1/profiles/player_one", { credentials: "omit", cache: "no-store" }]);
    expect(fetcher.mock.calls[0][1]?.headers).toBeUndefined();
  });
  it("rejects unsafe paths before the request", async () => {
    await expect(loadPublicProfile("../me/profile")).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("distinguishes a missing username from unavailable services", async () => {
    fetcher.mockResolvedValueOnce(Response.json({}, { status: 404 }));
    await expect(loadPublicProfile("player_one")).rejects.toMatchObject({ code: "not_found" });
    fetcher.mockResolvedValueOnce(Response.json({}, { status: 503 }));
    await expect(loadPublicProfile("player_one")).rejects.toThrow("temporarily unavailable");
  });
  it("rejects malformed and mismatched profile responses", async () => {
    for (const body of [null, {}, { profile: { ...profile, username: "someone_else" } }, { profile: { ...profile, bio: 42 } }]) {
      fetcher.mockResolvedValueOnce(Response.json(body));
      await expect(loadPublicProfile("player_one")).rejects.toThrow("could not be read");
    }
  });
});
