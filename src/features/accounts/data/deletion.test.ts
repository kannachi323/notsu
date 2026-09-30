import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptIdentity, useAccountStore } from "../accountStore";
import { deleteOwnAccount } from "./deletion";

const mock = vi.hoisted(() => ({ create: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), dispose: vi.fn(), forget: vi.fn() }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mock.create }));
vi.mock("./auth", () => ({ configuration: { authUrl: "https://auth.test", apiUrl: "https://api.test", key: "sb_publishable_test" },
  AccountError: class extends Error { constructor(message: string, public code = "unavailable") { super(message); } },
  authError: () => new Error("Incorrect password"), forgetDeletedAccount: mock.forget,
}));

describe("deletion client", () => {
  const fetcher = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetcher); acceptIdentity({ id: "one", email: "one@example.test" });
    mock.create.mockReturnValue({ auth: { signInWithPassword: mock.signIn, signOut: mock.signOut, dispose: mock.dispose } });
    mock.signIn.mockResolvedValue({ data: { user: { id: "one" }, session: { access_token: "fresh-proof" } }, error: null });
    mock.signOut.mockResolvedValue({ error: null }); mock.dispose.mockResolvedValue(undefined); mock.forget.mockResolvedValue(undefined);
    fetcher.mockResolvedValue(new Response(null, { status: 204 }));
  });
  afterEach(() => { acceptIdentity(null); vi.unstubAllGlobals(); vi.clearAllMocks(); });
  it("requires explicit confirmation before password authentication", async () => {
    await expect(deleteOwnAccount("current password", "delete")).rejects.toThrow("DELETE");
    expect(mock.create).not.toHaveBeenCalled();
  });
  it("authenticates separately without saving credentials and sends only confirmation to the Worker", async () => {
    await deleteOwnAccount("current password", "DELETE");
    expect(mock.create.mock.calls[0][2].auth).toMatchObject({ persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: expect.stringMatching(/^notsu-delete-/) });
    expect(mock.signIn).toHaveBeenCalledWith({ email: "one@example.test", password: "current password" });
    expect(fetcher.mock.calls[0]).toMatchObject(["https://api.test/v1/me/account", {
      method: "DELETE", credentials: "omit", headers: { Authorization: "Bearer fresh-proof" }, body: '{"confirmation":"DELETE"}',
    }]);
    expect(mock.forget).toHaveBeenCalledWith("one");
    expect(mock.dispose).toHaveBeenCalledOnce();
  });
  it("rejects an incorrect password before contacting the deletion API", async () => {
    mock.signIn.mockResolvedValueOnce({ data: { user: null, session: null }, error: { code: "invalid_credentials" } });
    await expect(deleteOwnAccount("incorrect", "DELETE")).rejects.toThrow("Incorrect password");
    expect(fetcher).not.toHaveBeenCalled(); expect(mock.forget).not.toHaveBeenCalled();
  });
  it("will not delete another account if the identity changes while reauthenticating", async () => {
    mock.signIn.mockImplementationOnce(async () => {
      acceptIdentity({ id: "two", email: "two@example.test" });
      return { data: { user: { id: "one" }, session: { access_token: "proof" } }, error: null };
    });
    await expect(deleteOwnAccount("password", "DELETE")).rejects.toThrow("account changed");
    expect(fetcher).not.toHaveBeenCalled();
    expect(mock.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("keeps the app identity and revokes the extra session after a refused deletion", async () => {
    fetcher.mockResolvedValueOnce(Response.json({}, { status: 503 }));
    await expect(deleteOwnAccount("password", "DELETE")).rejects.toThrow("could not be confirmed");
    expect(useAccountStore.getState().identity?.id).toBe("one");
    expect(mock.forget).not.toHaveBeenCalled(); expect(mock.signOut).toHaveBeenCalledWith({ scope: "local" });
  });
  it("does not claim success or retry a lost response, even if cleanup fails", async () => {
    fetcher.mockRejectedValueOnce(new Error("network details")); mock.signOut.mockRejectedValueOnce(new Error("cleanup"));
    mock.dispose.mockRejectedValueOnce(new Error("dispose"));
    await expect(deleteOwnAccount("password", "DELETE")).rejects.toThrow("could not be confirmed");
    expect(fetcher).toHaveBeenCalledOnce(); expect(mock.forget).not.toHaveBeenCalled();
  });
  it("does not turn confirmed deletion into failure when disposing the proof client fails", async () => {
    mock.dispose.mockRejectedValueOnce(new Error("dispose"));
    await expect(deleteOwnAccount("password", "DELETE")).resolves.toBeUndefined();
    expect(mock.forget).toHaveBeenCalledWith("one");
  });
});
