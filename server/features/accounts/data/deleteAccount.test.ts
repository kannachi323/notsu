import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../../app";
import type { Bindings } from "../../../config";
import { requireRecentPassword } from "./deleteAccount";

const now = Math.floor(Date.now() / 1000);
const id = "a36b39d2-8a09-4cc6-8dd1-e11bcb0b07af";
const token = (amr: unknown = [{ method: "password", timestamp: now }], sub = id) =>
  `e30.${btoa(JSON.stringify({ sub, amr, iat: now })).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.signature`;
const env: Bindings = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  SUPABASE_SECRET_KEY: "sb_secret_test", ALLOWED_ORIGINS: "http://127.0.0.1:1420" };
const user = { id, role: "authenticated", email: "test@example.invalid", email_confirmed_at: "2026-01-01", is_anonymous: false };
const request = (body: unknown = { confirmation: "DELETE" }, bearer = token(), bindings = env) => app.request("/v1/me/account", {
  method: "DELETE", headers: { Authorization: `Bearer ${bearer}`, "Content-Type": "application/json" }, body: JSON.stringify(body),
}, bindings);

describe("password confirmation freshness", () => {
  it("uses the password authentication time, never token refresh time or user metadata", () => {
    expect(() => requireRecentPassword(token([{ method: "password", timestamp: now - 120 }]), id, now)).not.toThrow();
    for (const amr of [undefined, [], ["password"], null, { method: "password", timestamp: now },
      [{ method: "password", timestamp: now - 121 }], [{ method: "recovery", timestamp: now }],
      [{ method: "password", timestamp: now + 6 }], [{ method: "password", timestamp: String(now) }],
      [{ method: "token_refresh", timestamp: now }]]) {
      const value = amr === undefined ? null : amr;
      expect(() => requireRecentPassword(token(value), id, now)).toThrow("current password");
    }
    expect(() => requireRecentPassword(token(undefined, "other"), id, now)).toThrow();
    expect(() => requireRecentPassword("invalid.token", id, now)).toThrow();
  });
});

describe("account deletion boundary", () => {
  const fetcher = vi.fn<typeof fetch>();
  beforeEach(() => {
    vi.stubGlobal("fetch", fetcher);
    fetcher.mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/auth/v1/user")) return Response.json(user);
      if (url.endsWith("/rpc/account_is_active")) return Response.json(true);
      if (url.endsWith(`/auth/v1/admin/users/${id}`)) return Response.json(user);
      if (url.includes("/rest/v1/profiles")) return Response.json([]);
      throw new Error("Unexpected service call");
    });
  });
  afterEach(() => { vi.unstubAllGlobals(); fetcher.mockReset(); });
  it("deletes only the verified caller and confines the privileged key to the admin request", async () => {
    expect((await request()).status).toBe(204);
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [index, [url, init]] of fetcher.mock.calls.entries()) {
      const headers = new Headers(init?.headers);
      expect(headers.get("apikey")).toBe(index === 2 ? env.SUPABASE_SECRET_KEY : env.SUPABASE_PUBLISHABLE_KEY);
      if (index === 2) {
        expect(String(url)).toBe(`${env.SUPABASE_URL}/auth/v1/admin/users/${id}`);
        expect(init?.method).toBe("DELETE");
        expect(JSON.parse(String(init?.body))).toEqual({ should_soft_delete: false });
      }
    }
  });
  it("does not elevate ordinary profile reads even when an admin binding exists", async () => {
    expect((await app.request("/v1/me/profile", { headers: { Authorization: `Bearer ${token()}` } }, env)).status).toBe(200);
    expect(fetcher.mock.calls.every(([, init]) => new Headers(init?.headers).get("apikey") === env.SUPABASE_PUBLISHABLE_KEY)).toBe(true);
  });
  it("rejects caller-selected IDs and missing or wrong confirmations before admin access", async () => {
    for (const body of [{}, null, [], { confirmation: "delete" }, { confirmation: "DELETE", id: "victim" }, { confirmation: "DELETE", password: "secret" }]) {
      expect((await request(body)).status).toBe(400);
    }
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("/admin/"))).toBe(false);
  });
  it("rejects old password proofs despite a fresh iat", async () => {
    expect((await request(undefined, token([{ method: "password", timestamp: now - 300 }]))).status).toBe(403);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it("cannot trust forged claims or a revoked session", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ code: "bad_jwt", msg: "bad signature" }, { status: 401 }));
    expect((await request()).status).toBe(401);
    fetcher.mockResolvedValueOnce(Response.json(user)).mockResolvedValueOnce(Response.json(false));
    expect((await request()).status).toBe(403);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("/admin/"))).toBe(false);
  });
  it("fails closed if deletion lacks a privileged server binding", async () => {
    for (const key of [undefined, "sb_publishable_test", `e30.${btoa('{"role":"anon"}')}.sig`, "bad-secret"]) {
      expect((await request(undefined, token(), { ...env, SUPABASE_SECRET_KEY: key })).status).toBe(503);
    }
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("/admin/"))).toBe(false);
  });
  it("reports an uncertain service failure without exposing provider details or repeating deletion", async () => {
    fetcher.mockResolvedValueOnce(Response.json(user)).mockResolvedValueOnce(Response.json(true))
      .mockResolvedValueOnce(Response.json({ code: "unexpected_failure", msg: "private SQL detail" }, { status: 500 }))
      .mockResolvedValueOnce(Response.json(user));
    const result = await request();
    expect(result.status).toBe(503);
    expect(await result.text()).not.toContain("private SQL");
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "DELETE")).toHaveLength(1);
  });
  it("can confirm a completed deletion after an ambiguous upstream response", async () => {
    fetcher.mockResolvedValueOnce(Response.json(user)).mockResolvedValueOnce(Response.json(true))
      .mockResolvedValueOnce(Response.json({ code: "unexpected_failure", msg: "lost response" }, { status: 500 }))
      .mockResolvedValueOnce(Response.json({ code: "user_not_found", msg: "User not found" }, { status: 404, headers: { "x-supabase-api-version": "2024-01-01" } }));
    expect((await request()).status).toBe(204);
  });
  it("does not interpret an unavailable follow-up lookup as deletion success", async () => {
    fetcher.mockResolvedValueOnce(Response.json(user)).mockResolvedValueOnce(Response.json(true))
      .mockResolvedValueOnce(Response.json({ msg: "outage" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ msg: "outage" }, { status: 503 }));
    expect((await request()).status).toBe(503);
  });
});
