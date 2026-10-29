import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { retainMapMedia } from "./retention";
import type { Bindings } from "../../../config";
const rpc=vi.hoisted(()=>vi.fn());
vi.mock("./publication",()=>({ mapRpc:rpc }));
const owner="11111111-1111-4111-8111-111111111111", generation="22222222-2222-4222-8222-222222222222";
const key=(hash:string)=>`maps/${owner}/${hash.repeat(64)}/${generation}/${hash.repeat(64)}.notsumap`;
const now=Date.parse("2026-10-04T20:00:00Z"), old=new Date(now-3*86400000), recent=new Date(now-86400000);
const bucket={ list:vi.fn(),delete:vi.fn(),put:vi.fn(),get:vi.fn() };
const env:Bindings={ SUPABASE_URL:"https://project.supabase.co",SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test",SUPABASE_SECRET_KEY:"sb_secret_test",ALLOWED_ORIGINS:"http://127.0.0.1:1420",MAP_MEDIA:bucket };
beforeEach(()=>{ vi.clearAllMocks(); bucket.delete.mockResolvedValue(undefined); rpc.mockImplementation(async(_db,name)=>name==="map_media_sweep_cursor" ? null : name==="referenced_map_media" ? [key("a")] : true); });
afterEach(()=>vi.clearAllMocks());
it("keeps referenced/withdrawn maps and new objects while deleting old unreferenced media",async()=>{
  bucket.list.mockResolvedValue({ objects:[{ key:key("a"),uploaded:old },{ key:key("b"),uploaded:old },{ key:key("c"),uploaded:recent },{ key:"unrelated/file",uploaded:old }],truncated:false });
  expect(await retainMapMedia(env,now)).toEqual({ scanned:4,removed:1 }); expect(bucket.delete).toHaveBeenCalledWith([key("b")]);
});
it("retains every object if reference verification fails",async()=>{
  bucket.list.mockResolvedValue({ objects:[{ key:key("b"),uploaded:old }],truncated:false });
  rpc.mockImplementation(async(_db,name)=>{ if (name==="referenced_map_media") throw new Error("Database unavailable"); return null; });
  await expect(retainMapMedia(env,now)).rejects.toThrow(); expect(bucket.delete).not.toHaveBeenCalled();
  expect(rpc.mock.calls.some(call=>call[1]==="advance_map_media_sweep")).toBe(false);
});
it("does not skip failed deletions when advancing the durable inventory cursor",async()=>{
  bucket.list.mockResolvedValue({ objects:[{ key:key("b"),uploaded:old }],truncated:true,cursor:"next" });
  rpc.mockImplementation(async(_db,name)=>name==="map_media_sweep_cursor" ? "start" : []);
  bucket.delete.mockRejectedValueOnce(new Error("Storage unavailable"));
  await expect(retainMapMedia(env,now)).rejects.toThrow("Storage unavailable");
  expect(rpc.mock.calls.some(call=>call[1]==="advance_map_media_sweep")).toBe(false);
});
it("limits each sweep and resumes from a persisted cursor",async()=>{
  bucket.list.mockImplementation(async({ cursor })=>({ objects:[],truncated:true,cursor:`${cursor ?? "start"}-next` }));
  expect(await retainMapMedia(env,now)).toEqual({ scanned:0,removed:0 }); expect(bucket.list).toHaveBeenCalledTimes(5);
  expect(bucket.list.mock.calls[1][0].cursor).toBe("start-next"); expect(rpc.mock.calls.filter(call=>call[1]==="advance_map_media_sweep")).toHaveLength(5);
});
