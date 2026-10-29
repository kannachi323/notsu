import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import catalog from "./starterCatalog.json";
import { acceptIdentity } from "../../accounts/accountStore";
import { boundedBytes, downloadOnlineMap, listOnlineMaps, publishOnlineMap } from "./online";
import { unpackMap } from "./package";

const owner="11111111-1111-4111-8111-111111111111", id="22222222-2222-4222-8222-222222222222";
const auth=vi.hoisted(()=>({ session:vi.fn() }));
vi.mock("../../accounts/data/auth",()=>({ configuration:{ apiUrl:"https://api.test" },accountClient:()=>({ auth:{ getSession:auth.session } }),
  AccountError:class extends Error { constructor(message:string,public code="unavailable") { super(message); } },authError:()=>new Error("Authentication failed"),
}));
vi.mock("./packageClient",()=>({ mapJob:({ bytes }: { bytes:Uint8Array })=>unpackMap(bytes) }));
const row=catalog[0], bytes=new Uint8Array(readFileSync(new URL(`../../../../public/maps/${row.file}`,import.meta.url)));
const digest=Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),byte=>byte.toString(16).padStart(2,"0")).join("");
const map={ ...row,onlineSetId:id,publisherId:owner,publisher:"map_one",bytes:bytes.length,archiveSha256:digest,publishedAt:"2026-10-04T18:00:00Z",visible:true,moderated:false,version:id };
const fetcher=vi.fn<typeof fetch>();
beforeEach(()=>{ vi.stubGlobal("fetch",fetcher); fetcher.mockReset(); acceptIdentity({ id:owner,email:"one@example.test" }); auth.session.mockResolvedValue({ data:{ session:{ user:{ id:owner },access_token:"memory-only-token" } },error:null }); });
afterEach(()=>{ acceptIdentity(null); vi.unstubAllGlobals(); });
it("searches publicly without transmitting the signed-in session",async()=>{
  fetcher.mockResolvedValue(Response.json({ items:[map],next:null }));
  expect((await listOnlineMaps("Signal & violet")).items[0].revision).toBe(row.revision);
  const [url,init]=fetcher.mock.calls[0]; expect(String(url)).toContain("q=Signal+%26+violet"); expect(new Headers(init?.headers).has("Authorization")).toBe(false); expect(auth.session).not.toHaveBeenCalled();
});
it("rejects a streaming response exceeding its limit even without Content-Length",async()=>{
  const response=new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(4)); controller.enqueue(new Uint8Array(4)); controller.close(); } }));
  await expect(boundedBytes(response,6)).rejects.toThrow("size limit");
});
it("checks exact archive bytes and the logical revision before a download can be imported",async()=>{
  fetcher.mockResolvedValue(new Response(new Uint8Array(bytes)));
  expect((await downloadOnlineMap(map)).loaded.revision).toBe(map.revision);
  const damaged=new Uint8Array(bytes); damaged[60]^=1; fetcher.mockResolvedValueOnce(new Response(damaged));
  await expect(downloadOnlineMap(map)).rejects.toThrow("fingerprint");
  fetcher.mockResolvedValueOnce(new Response(new Uint8Array(bytes)));
  await expect(downloadOnlineMap({ ...map,revision:"f".repeat(64) })).rejects.toThrow("revision");
});
it("preserves the upload receipt identity across a lost response and retry",async()=>{
  fetcher.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(Response.json(map));
  await expect(publishOnlineMap(row.revision,bytes,id)).rejects.toThrow("not be confirmed");
  expect((await publishOnlineMap(row.revision,bytes,id)).revision).toBe(row.revision);
  expect(fetcher.mock.calls[0][0]).toBe(fetcher.mock.calls[1][0]);
  expect(String(fetcher.mock.calls[0][0])).toContain(`uploadId=${id}&rights=confirmed`);
});
it("rejects a publication response after the active account changes",async()=>{
  fetcher.mockImplementation(async()=>{ acceptIdentity({ id:"33333333-3333-4333-8333-333333333333",email:"two@example.test" }); return Response.json(map); });
  await expect(publishOnlineMap(row.revision,bytes,id)).rejects.toThrow("account changed");
});
