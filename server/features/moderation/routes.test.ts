import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../app";
const owner = "11111111-1111-4111-8111-111111111111", target = "22222222-2222-4222-8222-222222222222", id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const env = { SUPABASE_URL: "https://auth.test", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", SUPABASE_SECRET_KEY: "sb_secret_never_used", ALLOWED_ORIGINS: "http://127.0.0.1:1420" };
const headers = { Authorization: "Bearer verified.user.token", "Content-Type": "application/json" };
const user = { id: owner, role: "authenticated", email: "local@example.test", email_confirmed_at: "2026-01-01", is_anonymous: false };
const input = { id, targetId: target, messageId: null, reason: "other", details: "Test concern", block: false };
const receipt = { id, kind: "profile", targetName: "Player", reason: "other", status: "open", createdAt: "2026-09-29T01:02:03.123456Z", reviewedAt: null };
describe("reporting API", () => {
  const fetcher = vi.fn<typeof fetch>();
  beforeEach(() => { vi.stubGlobal("fetch", fetcher); fetcher.mockImplementation(async input => {
    const url = String(input); if (url.endsWith("/auth/v1/user")) return Response.json(user);
    if (url.endsWith("/rpc/account_is_active")) return Response.json(true);
    if (url.endsWith("/rpc/submit_report")) return Response.json(receipt);
    if (url.endsWith("/rpc/list_own_reports")) return Response.json([]);
    if (url.endsWith("/rpc/moderation_access")) return Response.json({ moderator: false, restriction: null });
    return Response.json({ code: "42501", message: "moderator_required" }, { status: 403 });
  }); });
  afterEach(() => { vi.unstubAllGlobals(); fetcher.mockReset(); });
  it("requires authentication for reports, context, role checks and decisions", async () => {
    for (const path of ["/v1/me/reports", `/v1/me/reports/context?target=${target}`, "/v1/me/moderation/access", "/v1/me/moderation/reports", `/v1/me/moderation/reports/${id}`]) expect((await app.request(path, {}, env)).status).toBe(401);
    expect((await app.request(`/v1/me/moderation/reports/${id}`, { method: "PUT" }, env)).status).toBe(401); expect(fetcher).not.toHaveBeenCalled();
  });
  it("uses the caller JWT and public key, never the admin key", async () => {
    const result = await app.request("/v1/me/reports", { method: "PUT", headers, body: JSON.stringify(input) }, env);
    expect(result.status).toBe(200); expect(await result.json()).toEqual(receipt);
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({ p_id: id, p_target: target, p_message: null, p_reason: "other", p_details: "Test concern", p_block: false });
    expect(fetcher.mock.calls.every(([, init]) => new Headers(init?.headers).get("apikey") === env.SUPABASE_PUBLISHABLE_KEY)).toBe(true);
  });
  it("refuses supplied evidence, spoofed authors and oversized streams", async () => {
    for (const extra of [{ reporterId: target }, { evidence: { body: "fake" } }, { status: "dismissed" }]) expect((await app.request("/v1/me/reports", { method: "PUT", headers, body: JSON.stringify({ ...input, ...extra }) }, env)).status).toBe(400);
    expect((await app.request("/v1/me/reports", { method: "PUT", headers, body: " ".repeat(17000) }, env)).status).toBe(413);
    expect((await app.request(`/v1/me/moderation/reports/${id}`, { method: "PUT", headers, body: " ".repeat(5000) }, env)).status).toBe(413);
  });
  it("does not trust user metadata as a moderator role", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ ...user, user_metadata: { moderator: true } }));
    const result = await app.request("/v1/me/moderation/reports", { headers }, env);
    expect(result.status).toBe(403); expect(await result.text()).toContain("access_denied");
  });
  it("returns only safe error codes for conflicts, quotas and failures", async () => {
    for (const [message, status] of [["report_changed", 409], ["profile_changed", 409], ["report_rate_limited", 429], ["private SQL", 503]] as const) {
      fetcher.mockResolvedValueOnce(Response.json(user)).mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json({ code: "P0001", message }, { status: 400 }));
      const result = await app.request("/v1/me/reports", { method: "PUT", headers, body: JSON.stringify(input) }, env);
      expect(result.status).toBe(status); expect(await result.text()).not.toContain("private SQL");
    }
  });
});
