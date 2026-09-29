import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptIdentity } from "../../accounts/accountStore";
import { loadModerationAccess, loadReport, loadReportContext, loadReports, submitReport } from "./reports";
const mock = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("../../accounts/data/auth", () => ({ configuration: { apiUrl: "https://api.test" }, accountClient: () => ({ auth: { getSession: mock.session } }), authError: () => new Error("Session unavailable"), AccountError: class extends Error { constructor(message: string, public code = "unavailable") { super(message); } } }));
const owner = "11111111-1111-4111-8111-111111111111", target = "22222222-2222-4222-8222-222222222222", id = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const input = { id, targetId: target, messageId: null, reason: "other" as const, details: "Test concern", block: false };
const receipt = { id, kind: "profile", targetName: "Player", reason: "other", status: "open", createdAt: "2026-09-29T01:02:03.123456Z", reviewedAt: null };
describe("private reporting adapter", () => {
  const fetcher = vi.fn<typeof fetch>();
  beforeEach(() => { vi.stubGlobal("fetch", fetcher); acceptIdentity({ id: owner, email: "local@example.test" }); mock.session.mockResolvedValue({ data: { session: { access_token: "token", user: { id: owner } } }, error: null }); });
  afterEach(() => { acceptIdentity(null); vi.unstubAllGlobals(); vi.clearAllMocks(); fetcher.mockReset(); });
  it("retries uncertain submission with identical content and ID", async () => {
    fetcher.mockRejectedValueOnce(new Error("lost")); await expect(submitReport(input)).rejects.toThrow("Retry the same");
    fetcher.mockResolvedValueOnce(Response.json(receipt)); await submitReport(input);
    expect(fetcher.mock.calls.map(([, init]) => init?.body)).toEqual([JSON.stringify(input), JSON.stringify(input)]);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "omit", cache: "no-store", headers: { Authorization: "Bearer token" } });
  });
  it("checks the current identity before requests and after parsing", async () => {
    mock.session.mockResolvedValueOnce({ data: { session: { user: { id: target } } } });
    await expect(loadModerationAccess()).rejects.toThrow("Sign in"); expect(fetcher).not.toHaveBeenCalled();
    const response = Response.json({}); response.json = async () => { acceptIdentity({ id: target, email: "new@example.test" }); return { moderator: true, restriction: null }; };
    fetcher.mockResolvedValueOnce(response); await expect(loadModerationAccess()).rejects.toThrow("account changed");
  });
  it("rejects mismatched evidence and altered report receipts", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ kind: "profile", targetId: owner, username: "test", displayName: "Test", bio: "", message: null }));
    await expect(loadReportContext(target, null)).rejects.toThrow("did not match");
    for (const patch of [{ id: owner }, { kind: "message" }, { reason: "spam" }]) {
      fetcher.mockResolvedValueOnce(Response.json({ ...receipt, ...patch })); await expect(submitReport(input)).rejects.toThrow("did not match");
    }
  });
  it("preserves microsecond cursors and rejects fabricated next pages", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ items: [], next: null }));
    await loadReports("own", { time: receipt.createdAt, id });
    expect(decodeURIComponent(String(fetcher.mock.calls[0][0]))).toContain(receipt.createdAt);
    fetcher.mockResolvedValueOnce(Response.json({ items: [receipt], next: { time: receipt.createdAt, id } }));
    await expect(loadReports("own")).rejects.toThrow("next report page");
  });
  it("never displays upstream SQL or inherited error-map members", async () => {
    for (const code of ["constructor", "__proto__", "unknown"]) {
      fetcher.mockResolvedValueOnce(Response.json({ error: { code, message: "private SQL" } }, { status: 503 }));
      await expect(loadReport(id)).rejects.toThrow("could not be completed");
    }
  });
});
