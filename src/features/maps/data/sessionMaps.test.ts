import { afterEach, expect, it } from "vitest";
import { mapFixture } from "./package.fixture";
import { favoriteSessionMap, forgetSessionMap, keepSessionMap, readSessionMap, sessionMapSummaries } from "./sessionMaps";

afterEach(()=>{ for (const row of sessionMapSummaries()) forgetSessionMap(row.revision); });
it("keeps verified packs and favorites available after a library instance is discarded",async()=>{
  const { set,audio }=await mapFixture(), revision="a".repeat(64), bytes=new Uint8Array([1,2,3]);
  keepSessionMap({ set,audio,revision },bytes); favoriteSessionMap(revision);
  expect(readSessionMap(revision)?.bytes).toEqual(bytes);
  expect(sessionMapSummaries()).toMatchObject([{ revision,favorite:true,title:set.title }]);
  keepSessionMap({ set,audio,revision },bytes);
  expect(readSessionMap(revision)?.summary.favorite).toBe(true);
  forgetSessionMap(revision); expect(readSessionMap(revision)).toBeUndefined();
});
it("bounds temporary archives rather than letting repeated storage failures consume unbounded memory",async()=>{
  const { set,audio }=await mapFixture();
  for (let index=0;index<20;index++) keepSessionMap({ set,audio,revision:index.toString(16).padStart(64,"0") },new Uint8Array([1]));
  expect(()=>keepSessionMap({ set,audio,revision:"f".repeat(64) },new Uint8Array([1]))).toThrow("full");
  expect(sessionMapSummaries()).toHaveLength(20);
});
