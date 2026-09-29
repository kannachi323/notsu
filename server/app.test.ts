import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "./app";
import { readConfig, type Bindings } from "./config";

const env: Bindings = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  ALLOWED_ORIGINS: "http://127.0.0.1:1420,tauri://localhost" };
const user = { id: "a36b39d2-8a09-4cc6-8dd1-e11bcb0b07af", role: "authenticated",
  email: "test@example.invalid", email_confirmed_at: "2026-01-01T00:00:00Z", is_anonymous: false };
const profile = { id: user.id, username: "player_a", display_name: "Player A", bio: "Hello",
  created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z" };
const auth = { Authorization: "Bearer signed.test.token" };
const json = (value: unknown, status = 200) => Response.json(value, { status });

describe("account API boundary", () => {
  const fetcher = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetcher);
    fetcher.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes("/auth/v1/user")) return json(user);
      if (url.endsWith("/rpc/account_is_active")) return json(true);
      if (url.endsWith("/rpc/save_profile")) return json(profile);
      if (url.includes("/rest/v1/profiles")) return json([profile]);
      throw new Error("Unexpected external request");
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); fetcher.mockReset(); });

  it("separates liveness from account configuration", async () => {
    expect((await app.request("/health")).status).toBe(200);
    expect((await app.request("/v1/me/profile", {}, {})).status).toBe(503);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("requires a bearer token and ignores cookies or a supplied user ID", async () => {
    const invalidHeaders: Record<string, string>[] = [{}, { Cookie: "access_token=test" }, { Authorization: "Basic token" },
      { Authorization: "Bearer a,b" }, { Authorization: `Bearer ${"a".repeat(8192)}` }];
    for (const headers of invalidHeaders) {
      expect((await app.request("/v1/me/profile?userId=somebody", { headers }, env)).status).toBe(401);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("verifies with Auth then keeps the same identity on the data request", async () => {
    const result = await app.request("/v1/me/profile", { headers: auth }, env);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ profile: { id: user.id, username: "player_a", displayName: "Player A",
      bio: "Hello", createdAt: profile.created_at, updatedAt: profile.updated_at } });
    expect(fetcher).toHaveBeenCalledTimes(3);
    expect(String(fetcher.mock.calls[2][0])).toContain(`id=eq.${user.id}`);
    for (const [, init] of fetcher.mock.calls) {
      expect(new Headers(init?.headers).get("authorization")).toBe(auth.Authorization);
      expect(new Headers(init?.headers).get("apikey")).toBe(env.SUPABASE_PUBLISHABLE_KEY);
    }
    expect(result.headers.get("Cache-Control")).toBe("private, no-store");
    expect(result.headers.get("Set-Cookie")).toBeNull();
  });
  it("uses the public identity for public profile reads and strips extra fields", async () => {
    fetcher.mockResolvedValueOnce(json([{ ...profile, email: user.email, role: "moderator" }]));
    const result = await app.request("/v1/profiles/PLAYER_A", { headers: auth }, env);
    expect(result.status).toBe(200);
    expect(JSON.stringify(await result.json())).not.toContain(user.email);
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("authorization")).not.toBe(auth.Authorization);
  });
  it("does not create a profile as a side effect of GET", async () => {
    fetcher.mockResolvedValueOnce(json(user)).mockResolvedValueOnce(json(true)).mockResolvedValueOnce(json([]));
    const result = await app.request("/v1/me/profile", { headers: auth }, env);
    expect(await result.json()).toEqual({ profile: null });
    expect(fetcher.mock.calls.every(([url, init]) => (init?.method ?? "GET") === "GET" ||
      String(url).endsWith("/rpc/account_is_active"))).toBe(true);
  });
  it("rejects unverified and anonymous accounts and revoked sessions", async () => {
    for (const override of [{ email_confirmed_at: null }, { is_anonymous: true }]) {
      fetcher.mockResolvedValueOnce(json({ ...user, ...override }));
      expect((await app.request("/v1/me/profile", { headers: auth }, env)).status).toBe(403);
    }
    fetcher.mockResolvedValueOnce(json(user)).mockResolvedValueOnce(json(false));
    expect((await app.request("/v1/me/profile", { headers: auth }, env)).status).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
  it("distinguishes unavailable services from an invalid session without exposing provider errors", async () => {
    fetcher.mockResolvedValueOnce(json({ msg: "private provider details" }, 401));
    expect((await app.request("/v1/me/profile", { headers: auth }, env)).status).toBe(401);
    fetcher.mockResolvedValueOnce(json({ msg: "private provider details" }, 503));
    const result = await app.request("/v1/me/profile", { headers: auth }, env);
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("private provider details");
  });
  it("allows exact origins without credentialed cookies", async () => {
    const headers = { Origin: "http://127.0.0.1:1420", "Access-Control-Request-Method": "PUT",
      "Access-Control-Request-Headers": "authorization,content-type" };
    const result = await app.request("/v1/me/profile", { method: "OPTIONS", headers }, env);
    expect(result.status).toBe(204);
    expect(result.headers.get("Access-Control-Allow-Origin")).toBe(headers.Origin);
    expect(result.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    for (const Origin of ["null", "https://evil.test", "http://127.0.0.1:1420.evil.test"]) {
      const denied = await app.request("/v1/me/profile", { method: "OPTIONS", headers: { ...headers, Origin } }, env);
      expect(denied.status).toBe(403);
      expect(denied.headers.get("Access-Control-Allow-Origin")).toBeNull();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects unknown fields, malformed JSON, other content types and oversized bodies", async () => {
    const cases: [string, string, number][] = [
      ['{"username":"test","displayName":"Test","bio":"","id":"other"}', "application/json", 400],
      ["{broken", "application/json", 400], ["{}", "text/plain", 415],
      [JSON.stringify({ username: "test", displayName: "Test", bio: "x".repeat(5000) }), "application/json", 413],
    ];
    for (const [body, contentType, status] of cases) {
      const result = await app.request("/v1/me/profile", {
        method: "PUT", headers: { ...auth, "Content-Type": contentType }, body,
      }, env);
      expect(result.status).toBe(status);
    }
    expect(fetcher.mock.calls.some(([input]) => String(input).includes("save_profile"))).toBe(false);
  });
  it("normalizes changes and never forwards an owner ID", async () => {
    const result = await app.request("/v1/me/profile", { method: "PUT", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ username: " PLAYER_A ", displayName: " Player A ", bio: " Hello " }) }, env);
    expect(result.status).toBe(200);
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ p_username: "player_a", p_display_name: "Player A", p_bio: "Hello" });
  });
  it("reports a username conflict without revealing the other account", async () => {
    fetcher.mockResolvedValueOnce(json(user)).mockResolvedValueOnce(json(true))
      .mockResolvedValueOnce(json({ code: "23505", details: "other-account", message: "database detail" }, 409));
    const result = await app.request("/v1/me/profile", { method: "PUT", headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ username: "player_a", displayName: "Player A", bio: "" }) }, env);
    expect(result.status).toBe(409);
    expect(await result.text()).not.toContain("other-account");
  });
});

describe("configuration", () => {
  it("rejects privileged keys, remote HTTP and broad origins", () => {
    const jwt = (role: string) => `e30.${btoa(JSON.stringify({ role }))}.test`;
    for (const patch of [{ SUPABASE_PUBLISHABLE_KEY: "sb_secret_test" }, { SUPABASE_PUBLISHABLE_KEY: jwt("service_role") },
      { SUPABASE_URL: "http://project.supabase.co" }, { SUPABASE_URL: "https://user:pass@project.supabase.co" },
      { ALLOWED_ORIGINS: "*" }, { ALLOWED_ORIGINS: "null" }, { ALLOWED_ORIGINS: "https://example.test/path" }]) {
      expect(() => readConfig({ ...env, ...patch })).toThrow();
    }
    expect(readConfig({ ...env, SUPABASE_PUBLISHABLE_KEY: jwt("anon") }).key).toBe(jwt("anon"));
  });
});
