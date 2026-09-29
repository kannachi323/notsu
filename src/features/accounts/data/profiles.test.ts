import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptIdentity, useAccountStore } from "../accountStore";
import { loadOwnProfile, saveOwnProfile } from "./profiles";
import type { Profile } from "../domain/profile";

vi.mock("./auth", () => ({
  configuration: { apiUrl: "https://api.example.test" },
  AccountError: class extends Error { constructor(message: string, public code = "unavailable") { super(message); } },
  authError: () => new Error("Session unavailable"),
  accountClient: () => ({ auth: { getSession: async () => ({ data: { session: { access_token: "test-token" } }, error: null }) } }),
}));
const profile: Profile = { id: "one", username: "player_one", displayName: "One", bio: "", createdAt: "2026-01-01", updatedAt: "2026-01-01" };

describe("profile session isolation", () => {
  const fetcher = vi.fn<typeof fetch>();
  beforeEach(() => { vi.stubGlobal("fetch", fetcher); acceptIdentity({ id: "one", email: "one@example.test" }); });
  afterEach(() => { acceptIdentity(null); vi.unstubAllGlobals(); fetcher.mockReset(); });
  it("loads the current profile using a bearer, without cookies", async () => {
    fetcher.mockResolvedValue(Response.json({ profile }));
    await loadOwnProfile();
    expect(useAccountStore.getState().profile).toEqual(profile);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "omit", cache: "no-store", headers: { Authorization: "Bearer test-token" } });
  });
  it("ignores an old load after the active account changes", async () => {
    let finish!: (value: Response) => void;
    fetcher.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const pending = loadOwnProfile();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    acceptIdentity({ id: "two", email: "two@example.test" });
    finish(Response.json({ profile })); await pending;
    expect(useAccountStore.getState().profile).toBeNull();
  });
  it("does not let an earlier load overwrite a newer save", async () => {
    let finish!: (value: Response) => void;
    fetcher.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const pending = loadOwnProfile();
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledOnce());
    fetcher.mockResolvedValueOnce(Response.json({ profile: { ...profile, bio: "New bio" } }));
    await saveOwnProfile({ username: profile.username, displayName: profile.displayName, bio: "New bio" });
    finish(Response.json({ profile })); await pending;
    expect(useAccountStore.getState().profile?.bio).toBe("New bio");
  });
  it("retains a loaded profile when a username save conflicts", async () => {
    useAccountStore.setState({ profile });
    fetcher.mockResolvedValue(Response.json({}, { status: 409 }));
    await expect(saveOwnProfile({ username: profile.username, displayName: profile.displayName, bio: "" })).rejects.toThrow("username");
    expect(useAccountStore.getState().profile).toEqual(profile);
  });
  it("rejects a profile belonging to another identity", async () => {
    fetcher.mockResolvedValue(Response.json({ profile: { ...profile, id: "two" } }));
    await loadOwnProfile();
    expect(useAccountStore.getState().profileStatus).toBe("error");
    expect(useAccountStore.getState().profile).toBeNull();
  });
  it("clears profile and recovery state on sign-out", () => {
    useAccountStore.setState({ profile, recovery: true, profileDirty: true });
    acceptIdentity(null);
    expect(useAccountStore.getState()).toMatchObject({ identity: null, profile: null, recovery: false, profileDirty: false });
  });
  it("shows a recoverable error for a malformed successful response", async () => {
    fetcher.mockResolvedValue(new Response("<html>provider details</html>", { status: 200 }));
    await loadOwnProfile();
    expect(useAccountStore.getState().profileError).toContain("unreadable response");
    expect(useAccountStore.getState().profileError).not.toContain("provider details");
  });
});
