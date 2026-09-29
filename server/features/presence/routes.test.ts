import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../app";
const owner = "11111111-1111-4111-8111-111111111111", target = "22222222-2222-4222-8222-222222222222";
const env = { SUPABASE_URL: "https://auth.test", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", SUPABASE_SECRET_KEY: "sb_secret_unused", ALLOWED_ORIGINS: "http://127.0.0.1:1420" };
const headers = { Authorization: "Bearer verified.user.token", "Content-Type": "application/json" };
const user = { id: owner, role: "authenticated", email: "owner@example.test", email_confirmed_at: "2026-01-01", is_anonymous: false };
const update = { clientId: target, sequence: 1, visible: true };
describe("presence API", () => {
  const fetcher = vi.fn<typeof fetch>();
  beforeEach(() => { vi.stubGlobal("fetch", fetcher); fetcher.mockImplementation(async input => {
    const url = String(input); if (url.endsWith("/auth/v1/user")) return Response.json(user);
    if (url.endsWith("/rpc/account_is_active")) return Response.json(true);
    if (url.endsWith("/rpc/renew_presence")) return Response.json({ visibility: "friends", validForMs: 89000 });
    if (url.endsWith("/rpc/get_presence_settings") || url.endsWith("/rpc/set_presence_visibility")) return Response.json({ visibility: "friends" });
    if (url.endsWith("/rpc/friend_presence")) return Response.json([{ user_id: target, online: false, valid_for_ms: 0 }]);
    throw new Error("Unexpected upstream");
  }); });
  afterEach(() => { vi.unstubAllGlobals(); fetcher.mockReset(); });
  it("requires a verified live session for reads and writes", async () => {
    for (const path of ["/v1/me/presence", "/v1/me/presence/settings"]) for (const method of ["GET", "PUT"]) expect((await app.request(path, { method }, env)).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses only the caller JWT and public key, leaving identity and timestamps to the database", async () => {
    const response = await app.request("/v1/me/presence", { method: "PUT", headers, body: JSON.stringify(update) }, env);
    expect(response.status).toBe(200); expect(await response.json()).toEqual({ visibility: "friends", validForMs: 89000 });
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ p_client: target, p_sequence: 1, p_visible: true });
    expect(fetcher.mock.calls.every(([, init]) => new Headers(init?.headers).get("apikey") === env.SUPABASE_PUBLISHABLE_KEY)).toBe(true);
  });
  it("rejects injected ownership, timestamps, duplicate players and oversized inputs", async () => {
    for (const body of [{ ...update, userId: owner }, { ...update, expiresAt: 90000 }, { ...update, sequence: 0 }]) expect((await app.request("/v1/me/presence", { method: "PUT", headers, body: JSON.stringify(body) }, env)).status).toBe(400);
    expect((await app.request(`/v1/me/presence?players=${target},${target}`, { headers }, env)).status).toBe(400);
    expect((await app.request("/v1/me/presence/settings", { method: "PUT", headers, body: JSON.stringify({ visibility: "friends", userId: target }) }, env)).status).toBe(400);
    expect((await app.request("/v1/me/presence", { method: "PUT", headers, body: " ".repeat(5000) }, env)).status).toBe(413);
  });
  it("strips extra server fields and rejects missing lookup rows", async () => {
    fetcher.mockResolvedValueOnce(Response.json(user)).mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json([{ user_id: target, online: false, valid_for_ms: 0, last_seen: "private" }]));
    const result = await app.request(`/v1/me/presence?players=${target}`, { headers }, env);
    expect(await result.json()).toEqual({ items: [{ userId: target, online: false, validForMs: 0 }] });
    fetcher.mockResolvedValueOnce(Response.json(user)).mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json([]));
    expect((await app.request(`/v1/me/presence?players=${target}`, { headers }, env)).status).toBe(503);
  });
  it("maps quotas and session errors without exposing SQL", async () => {
    for (const [code, message, status] of [["P0001", "presence_rate_limited", 429], ["P0001", "presence_window_limit", 429], ["42501", "revoked", 403], ["P0001", "private SQL", 503]] as const) {
      fetcher.mockResolvedValueOnce(Response.json(user)).mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json({ code, message }, { status: 400 }));
      const response = await app.request("/v1/me/presence", { method: "PUT", headers, body: JSON.stringify(update) }, env);
      expect(response.status).toBe(status); expect(await response.text()).not.toContain("private SQL");
    }
  });
});
