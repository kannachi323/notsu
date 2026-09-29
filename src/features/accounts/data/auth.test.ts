import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthChangeEvent, AuthError, Session } from "@supabase/supabase-js";

const mock = vi.hoisted(() => ({ create: vi.fn(), signOut: vi.fn(), callback: undefined as undefined | ((event: AuthChangeEvent, session: Session | null) => void) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: mock.create }));
const session = (id: string) => ({ user: { id, email: `${id}@example.test` } }) as Session;

describe("in-memory Auth lifecycle", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", "https://auth.example.test");
    vi.stubEnv("VITE_NOTSU_API_URL", "https://api.example.test");
    vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "sb_publishable_test");
    mock.signOut.mockResolvedValue({ error: null });
    mock.create.mockReturnValue({ auth: { signOut: mock.signOut, onAuthStateChange: (callback: typeof mock.callback) => {
      mock.callback = callback; return { data: { subscription: { unsubscribe: vi.fn() } } };
    } } });
  });
  afterEach(() => { vi.unstubAllEnvs(); mock.create.mockReset(); mock.signOut.mockReset(); mock.callback = undefined; });
  it("creates one client lazily, disables persistence and URL token detection", async () => {
    const auth = await import("./auth");
    expect(mock.create).not.toHaveBeenCalled();
    expect(auth.accountClient()).toBe(auth.accountClient());
    expect(mock.create).toHaveBeenCalledOnce();
    expect(mock.create.mock.calls[0][2].auth).toEqual({ persistSession: false, autoRefreshToken: true, detectSessionInUrl: false });
  });
  it("retains recovery across refreshes, but not across different accounts", async () => {
    const auth = await import("./auth"), { useAccountStore } = await import("../accountStore");
    auth.accountClient();
    mock.callback!("PASSWORD_RECOVERY", session("one"));
    expect(useAccountStore.getState().recovery).toBe(true);
    mock.callback!("TOKEN_REFRESHED", session("one"));
    expect(useAccountStore.getState().recovery).toBe(true);
    mock.callback!("SIGNED_IN", session("two"));
    expect(useAccountStore.getState().recovery).toBe(false);
    expect(useAccountStore.getState().identity?.id).toBe("two");
  });
  it("signs out only this session and clears account state", async () => {
    const auth = await import("./auth"), { useAccountStore } = await import("../accountStore");
    auth.accountClient(); mock.callback!("SIGNED_IN", session("one"));
    await auth.signOut();
    expect(mock.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(useAccountStore.getState().identity).toBeNull();
  });
  it("does not claim successful server sign-out after a network failure", async () => {
    const auth = await import("./auth"), { useAccountStore } = await import("../accountStore");
    auth.accountClient(); mock.callback!("SIGNED_IN", session("one"));
    mock.signOut.mockResolvedValue({ error: { message: "private error with token" } });
    await expect(auth.signOut()).rejects.toThrow("connection");
    expect(useAccountStore.getState().identity?.id).toBe("one");
  });
  it("does not display raw authentication service details", async () => {
    const { authError } = await import("./auth");
    expect(authError({ code: "unknown", message: "secret private details" } as AuthError).message).not.toContain("private details");
  });
});
