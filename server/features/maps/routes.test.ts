import { readFileSync } from "node:fs";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import app from "../../app";
import catalog from "../../../src/features/maps/data/starterCatalog.json";
import type { Bindings } from "../../config";
import { ONLINE_MAP_BYTES } from "../../../src/features/maps/domain/published";
import { archiveHash, mediaKey } from "./data/media";

const owner = "11111111-1111-4111-8111-111111111111", session = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", upload = "22222222-2222-4222-8222-222222222222";
const token = `signed.${Buffer.from(JSON.stringify({ sub: owner, session_id: session })).toString("base64url")}.signature`;
const row = catalog[0], bytes = new Uint8Array(readFileSync(new URL(`../../../public/maps/${row.file}`, import.meta.url)));
const metadata = { revision: row.revision, onlineSetId: upload, setId: row.setId, publisherId: owner, publisher: "mapper_one", title: row.title,
  artist: row.artist, author: row.author, difficulties: row.difficulties, bytes: bytes.length, archiveSha256: await archiveHash(bytes),
  publishedAt: "2026-09-29T16:00:00.123456Z", visible: true, moderated: false, version: upload };
const bucket = { put: vi.fn().mockResolvedValue({}), get: vi.fn() };
const env: Bindings = { SUPABASE_URL: "https://project.supabase.co", SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test", SUPABASE_SECRET_KEY: "sb_secret_test", ALLOWED_ORIGINS: "http://127.0.0.1:1420", MAP_MEDIA: bucket };
const fetcher = vi.fn<typeof fetch>();
const publish = (options: { body?: Uint8Array; revision?: string; rights?: string; key?: string; type?: string; extra?: Record<string,string> } = {}) => app.request(
  `/v1/me/maps/${options.revision ?? row.revision}?uploadId=${upload}&rights=${options.rights ?? "confirmed"}`,
  { method: "PUT", headers: { Authorization: `Bearer ${options.key ?? token}`, "Content-Type": options.type ?? "application/octet-stream", ...options.extra }, body: new Uint8Array(options.body ?? bytes) }, env);
beforeEach(() => {
  bucket.put.mockReset().mockResolvedValue({}); bucket.get.mockReset(); fetcher.mockReset(); vi.stubGlobal("fetch", fetcher);
  fetcher.mockImplementation(async (url, init) => {
    const path = String(url);
    if (path.endsWith("/auth/v1/user")) return Response.json({ id: owner, role: "authenticated", email: "local@example.invalid", email_confirmed_at: "2026-01-01", is_anonymous: false });
    if (path.endsWith("/rpc/account_is_active")) return Response.json(true);
    if (path.endsWith("/rpc/begin_map_upload")) return Response.json({ id: upload, entry: null });
    if (path.endsWith("/rpc/complete_map_upload")) {
      const body = JSON.parse(init!.body as string);
      expect(new Headers(init?.headers).get("apikey")).toBe("sb_secret_test");
      expect(body).toMatchObject({ p_owner: owner, p_session: session, p_revision: row.revision, p_sha256: metadata.archiveSha256, p_bytes: bytes.length });
      return Response.json(metadata);
    }
    if (path.endsWith("/rpc/published_map")) return Response.json(metadata);
    if (path.endsWith("/rpc/list_published_maps")) return Response.json([metadata]);
    throw new Error("Unexpected map database request");
  });
});
afterEach(() => vi.unstubAllGlobals());
it("validates an actual packaged recording before the immutable R2 write and trusted publication", async () => {
  const result = await publish();
  expect(result.status).toBe(200); expect(await result.json()).toEqual(metadata);
  expect(bucket.put).toHaveBeenCalledOnce();
  const [key, body, options] = bucket.put.mock.calls[0];
  expect(key).toBe(mediaKey(metadata)); expect(await archiveHash(body)).toBe(metadata.archiveSha256);
  expect(options.onlyIf.get("If-None-Match")).toBe("*"); expect(options.sha256).toBe(metadata.archiveSha256);
  const completion = fetcher.mock.calls.find(([url]) => String(url).endsWith("/complete_map_upload"))!;
  expect(JSON.parse(completion[1]!.body as string).p_metadata).not.toHaveProperty("ranked");
});
it("rejects raw songs, wrong revisions and damaged archives before storing media", async () => {
  expect((await publish({ type: "audio/mpeg" })).status).toBe(415);
  expect((await publish({ revision: "f".repeat(64) })).status).toBe(400);
  const damaged = new Uint8Array(bytes); damaged[60] ^= 1;
  expect((await publish({ body: damaged })).status).toBe(400);
  expect(bucket.put).not.toHaveBeenCalled();
});
it("requires confirmed distribution rights and a bounded binary body", async () => {
  expect((await publish({ rights: "no" })).status).toBe(400);
  expect((await publish({ extra: { "Content-Length": String(ONLINE_MAP_BYTES + 1) } })).status).toBe(413);
  expect(bucket.put).not.toHaveBeenCalled();
});
it("does not restore withdrawn or moderated content on an identical publication retry", async () => {
  const base = fetcher.getMockImplementation()!;
  fetcher.mockImplementation((url, init) => String(url).endsWith("/begin_map_upload") ? Promise.resolve(Response.json({ id: upload, entry: { ...metadata, visible: false, moderated: true } })) : base(url, init));
  const result = await publish();
  expect(await result.json()).toMatchObject({ visible: false, moderated: true }); expect(bucket.put).not.toHaveBeenCalled();
});
it("fails closed when object storage fails and never finalizes the publication", async () => {
  bucket.put.mockRejectedValueOnce(new Error("private provider details"));
  const result = await publish(); expect(result.status).toBe(503);
  expect(await result.text()).not.toContain("private provider");
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/complete_map_upload"))).toBe(false);
});
it("uses anonymous catalog reads even when an unrelated bearer header is present", async () => {
  const result = await app.request("/v1/maps?q=Orbit", { headers: { Authorization: `Bearer ${token}` } }, env);
  expect(result.status).toBe(200); expect(await result.json()).toEqual({ items: [metadata], next: null });
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("apikey")).toBe(env.SUPABASE_PUBLISHABLE_KEY);
  expect(new Headers(fetcher.mock.calls[0][1]?.headers).get("authorization")).not.toContain(token);
});
it("streams only a currently public pack with safe download headers", async () => {
  bucket.get.mockImplementation(async () => ({ size: bytes.length, httpEtag: '"etag"', body: new Blob([new Uint8Array(bytes)]).stream() }));
  const result = await app.request(`/v1/maps/${row.revision}/pack`, {}, env);
  expect(result.status).toBe(200); expect(await archiveHash(new Uint8Array(await result.arrayBuffer()))).toBe(metadata.archiveSha256);
  expect(result.headers.get("Cache-Control")).toBe("private, no-store");
  expect(result.headers.get("Content-Disposition")).toContain(".notsumap");
  expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
  fetcher.mockResolvedValueOnce(Response.json(null));
  expect((await app.request(`/v1/maps/${row.revision}/pack`, {}, env)).status).toBe(404);
  expect(bucket.get).toHaveBeenCalledOnce();
});
it("does not turn an unavailable or mismatched stored object into a successful download", async () => {
  bucket.get.mockResolvedValueOnce(null).mockResolvedValueOnce({ size: 1, body: null });
  expect((await app.request(`/v1/maps/${row.revision}/pack`, {}, env)).status).toBe(503);
  expect((await app.request(`/v1/maps/${row.revision}/pack`, {}, env)).status).toBe(503);
});
it("rejects hostile cursors and visibility fields before a database mutation", async () => {
  expect((await app.request("/v1/maps?beforeTime=2026-01-01", {}, env)).status).toBe(400);
  const result = await app.request(`/v1/me/maps/${row.revision}/visibility`, { method: "PUT", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ version: upload, visible: false, ownerId: owner }) }, env);
  expect(result.status).toBe(400);
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith("/set_map_visibility"))).toBe(false);
});
