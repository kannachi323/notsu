import {describe,it,expect} from "vitest";
import {messageInput,messageText,sequence,parseMessage,parseConversation,mergeMessagePage,type Message} from "./messages";
const id="11111111-1111-4111-8111-111111111111",time="2026-09-29T01:02:03.123456+00:00";
const msg=(position:string):Message=>({id,senderId:id,sequence:position,body:"Hello 🎵\n<script>plain text</script>",createdAt:time});
describe("message boundaries",()=>{
  it("preserves plain text and allows 2000 code points, not 2000 UTF-16 units",()=>{
    expect(messageText("🎵".repeat(2000))).toHaveLength(4000);
    expect(messageText("\tHello\n" )).toBe("\tHello\n");
    for(const value of [" ","", "🎵".repeat(2001),"hello\u0000", "bad\u0085"])expect(()=>messageText(value)).toThrow();
  });
  it("rejects forged owners, positions and extra fields",()=>{
    expect(messageInput({id,body:"Hello"})).toEqual({id,body:"Hello"});
    for(const extra of [{senderId:id},{createdAt:time},{recipientId:id},{sequence:"1"}])expect(()=>messageInput({id,body:"Hi",...extra})).toThrow();
    for(const position of [1,"0","-1","01","1.5","9223372036854775808"])expect(()=>sequence(position)).toThrow();
    expect(sequence("9223372036854775807")).toBe("9223372036854775807");
  });
  it("validates response fields and strips private/unknown fields",()=>{
    expect(parseMessage({...msg("1"),email:"hidden"})).toEqual(msg("1"));
    expect(()=>parseMessage({...msg("1"),createdAt:"bad"})).toThrow();
    expect(parseConversation({userId:id,username:"mapper",displayName:"Mapper",preview:null,updatedAt:time,unread:100,email:"hidden"})).not.toHaveProperty("email");
    expect(()=>parseConversation({userId:id,username:"mapper",displayName:"Mapper",preview:"x".repeat(101),updatedAt:time,unread:101})).toThrow();
  });
  it("merges contiguous realtime pages without dupes, preserving history cursors",()=>{
    expect(mergeMessagePage({items:[msg("3"),msg("2")],next:"2"},{items:[msg("5"),msg("4"),msg("3")],next:"3"},false)).toEqual({items:[msg("5"),msg("4"),msg("3"),msg("2")],next:"2"});
    expect(mergeMessagePage({items:[msg("3"),msg("2")],next:"2"},{items:[msg("1")],next:null},true)).toEqual({items:[msg("3"),msg("2"),msg("1")],next:null});
  });
  it("resets the visible range after a gap instead of claiming missing history is loaded",()=>{
    const page={items:[msg("9007199254740994"),msg("9007199254740993")],next:"9007199254740993"};
    expect(mergeMessagePage({items:[msg("1")],next:null},page,false)).toEqual(page);
  });
});
