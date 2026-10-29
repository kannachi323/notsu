import { expect, it } from "vitest";
import { publishedPage } from "./published";
const id="11111111-1111-4111-8111-111111111111";
const map={ revision:"a".repeat(64),onlineSetId:id,setId:"signal",publisherId:id,publisher:"map_one",title:"Signal",artist:"notsu",author:"Mapper",difficulties:[{ id:"intro",name:"Intro",author:"Mapper",notes:12,lanes:2,durationMs:10000 }],bytes:1000,archiveSha256:"b".repeat(64),publishedAt:"2026-10-04T18:00:00Z",visible:true,moderated:false,version:id };
it("rejects private, moderated, duplicate and malformed public catalog pages",()=>{
  for (const items of [[{ ...map,visible:false }],[{ ...map,moderated:true }],[map,map]]) expect(()=>publishedPage({ items,next:null })).toThrow();
  expect(()=>publishedPage({ items:[map],next:{} })).toThrow();
});
it("binds a continuation to the final row of a full public page",()=>{
  const items=Array.from({ length:30 },(_,index)=>({ ...map,revision:index.toString(16).padStart(64,"0") })), last=items.at(-1)!;
  const next={ time:last.publishedAt,revision:last.revision };
  expect(publishedPage({ items,next }).next).toEqual(next);
  expect(()=>publishedPage({ items,next:{ ...next,revision:map.revision } })).toThrow();
  expect(()=>publishedPage({ items:[map],next })).toThrow();
});
