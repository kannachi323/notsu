import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptIdentity } from "../../accounts/accountStore";
import { loadFriendPresence, renewPresence, setVisibility } from "./presence";
const mock = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("../../accounts/data/auth", () => ({ configuration: { apiUrl: "https://api.test" }, accountClient: () => ({ auth: { getSession: mock.session } }), authError: () => new Error("Session unavailable"), AccountError: class extends Error { constructor(message: string, public code = "unavailable") { super(message); } } }));
const owner = "11111111-1111-4111-8111-111111111111", target = "22222222-2222-4222-8222-222222222222";
describe("private presence adapter", () => {
  const fetcher = vi.fn<typeof fetch>();
  beforeEach(() => { vi.stubGlobal("fetch", fetcher); acceptIdentity({ id: owner, email: "local@example.test" }); mock.session.mockResolvedValue({ data: { session: { access_token: "token", user: { id: owner } } }, error: null }); });
  afterEach(() => { acceptIdentity(null); vi.unstubAllGlobals(); vi.restoreAllMocks(); fetcher.mockReset(); mock.session.mockReset(); });
  it("uses the current JWT and best-effort keepalive with no caller identity in the body", async () => {
    fetcher.mockResolvedValueOnce(Response.json({ visibility: "friends", validForMs: 0 }));
    await renewPresence(owner, { clientId: target, sequence: 2, visible: false }, true);
    expect(fetcher.mock.calls[0][1]).toMatchObject({ credentials: "omit", cache: "no-store", keepalive: true, headers: { Authorization: "Bearer token" }, body: JSON.stringify({ clientId: target, sequence: 2, visible: false }) });
  });
  it("prevents a departing account from updating its successor's presence", async () => {
    await expect(renewPresence(target, { clientId: target, sequence: 1, visible: true })).rejects.toThrow("Sign in");
    expect(fetcher).not.toHaveBeenCalled();
    const response = Response.json({}); response.json = async () => { acceptIdentity({ id: target, email: "new@example.test" }); return { visibility: "friends" }; };
    fetcher.mockResolvedValueOnce(response); await expect(setVisibility(owner, "friends")).rejects.toThrow("account changed");
  });
  it("validates exact lookup membership and cannot invent online players", async () => {
    for (const items of [[], [{ userId: owner, online: true, validForMs: 5000 }], [{ userId: target, online: false, validForMs: 5000 }]]) {
      fetcher.mockResolvedValueOnce(Response.json({ items })); await expect(loadFriendPresence([target])).rejects.toThrow();
    }
  });
  it("reduces lifetime by the full network round trip", async () => {
    vi.spyOn(performance, "now").mockReturnValueOnce(1000).mockReturnValueOnce(4000);
    fetcher.mockResolvedValueOnce(Response.json({ items: [{ userId: target, online: true, validForMs: 5000 }] }));
    expect(await loadFriendPresence([target])).toEqual([{ userId: target, onlineUntil: 6000 }]);
  });
  it("supports accumulated friend pages without exceeding the server batch limit", async () => {
    const ids = Array.from({ length: 101 }, (_, index) => `11111111-1111-4111-8111-${String(index).padStart(12, "0")}`);
    fetcher.mockImplementation(async input => Response.json({ items: new URL(String(input)).searchParams.get("players")!.split(",").map(userId => ({ userId, online: false, validForMs: 0 })) }));
    expect(await loadFriendPresence(ids)).toHaveLength(101);
    expect(fetcher.mock.calls.map(([input]) => new URL(String(input)).searchParams.get("players")!.split(",").length)).toEqual([50, 50, 1]);
  });
  it("sanitizes upstream errors and bounds work before sending requests", async () => {
    await expect(loadFriendPresence(Array(201).fill(target))).rejects.toThrow(); expect(fetcher).not.toHaveBeenCalled();
    for (const code of ["constructor", "__proto__", "unknown"]) {
      fetcher.mockResolvedValueOnce(Response.json({ error: { code, message: "private SQL" } }, { status: 503 }));
      await expect(loadFriendPresence([target])).rejects.toThrow("temporarily unavailable");
    }
  });
});
