import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import app from "../../app";
const owner="11111111-1111-4111-8111-111111111111",target="22222222-2222-4222-8222-222222222222",id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const env={SUPABASE_URL:"https://auth.test",SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test",SUPABASE_SECRET_KEY:"sb_secret_unused",ALLOWED_ORIGINS:"http://127.0.0.1:1420"};
const headers={Authorization:"Bearer verified.user.token","Content-Type":"application/json"};
const user={id:owner,role:"authenticated",email:"owner@example.test",email_confirmed_at:"2026-01-01",is_anonymous:false};
const message={id,senderId:owner,sequence:"1",body:"hello",createdAt:"2026-09-29T10:11:12.123456+00:00"};
describe("message API",()=>{
  const fetcher=vi.fn<typeof fetch>();
  beforeEach(()=>{vi.stubGlobal("fetch",fetcher);fetcher.mockImplementation(async input=>{
    const url=String(input);if(url.endsWith("/auth/v1/user"))return Response.json(user);
    if(url.endsWith("/rpc/account_is_active"))return Response.json(true);
    if(url.endsWith("/rpc/send_message"))return Response.json(message);
    if(url.endsWith("/rpc/list_messages")||url.endsWith("/rpc/list_conversations"))return Response.json([]);
    if(url.endsWith("/rpc/mark_messages_read"))return Response.json(null);
    throw new Error("Unexpected upstream");
  });});
  afterEach(()=>{vi.unstubAllGlobals();fetcher.mockReset();});
  it("requires authentication for every message and read-position route",async()=>{
    for(const [path,method] of [["/v1/me/conversations","GET"],[`/v1/me/messages/${target}`,"GET"],[`/v1/me/messages/${target}`,"PUT"],[`/v1/me/messages/${target}/read`,"PUT"]])expect((await app.request(path,{method},env)).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("passes only identity-free content via the caller JWT, never service role",async()=>{
    const response=await app.request(`/v1/me/messages/${target}`,{method:"PUT",headers,body:JSON.stringify({id,body:"hello"})},env);
    expect(response.status).toBe(200);expect(await response.json()).toEqual({message});
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({p_target:target,p_id:id,p_body:"hello"});
    expect(fetcher.mock.calls.every(([,init])=>new Headers(init?.headers).get("apikey")===env.SUPABASE_PUBLISHABLE_KEY)).toBe(true);
  });
  it("rejects forged ownership, unsafe cursors and oversized JSON",async()=>{
    for(const body of [{id,body:"hi",senderId:owner},{id,body:"x".repeat(2001)}])expect((await app.request(`/v1/me/messages/${target}`,{method:"PUT",headers,body:JSON.stringify(body)},env)).status).toBe(400);
    expect((await app.request(`/v1/me/messages/${target}`,{method:"PUT",headers,body:" ".repeat(17000)},env)).status).toBe(413);
    expect((await app.request(`/v1/me/messages/${target}?before=900000000000000000000`,{headers},env)).status).toBe(400);
    expect((await app.request(`/v1/me/messages/${target}/read`,{method:"PUT",headers,body:JSON.stringify({sequence:"1",userId:target})},env)).status).toBe(400);
  });
  it("returns bounded history, decimal-string cursors and no recipient metadata",async()=>{
    const rows=Array.from({length:51},(_,i)=>({id,sender_id:owner,sequence:String(100-i),body:"text",created_at:message.createdAt,recipient_email:"hidden"}));
    fetcher.mockResolvedValueOnce(Response.json(user)).mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json(rows));
    const body=await (await app.request(`/v1/me/messages/${target}`,{headers},env)).json();
    expect(body.items).toHaveLength(50);expect(body.next).toBe("51");expect(JSON.stringify(body)).not.toContain("hidden");
  });
  it("sanitizes database failures and distinguishes unavailable, conflict and rate limits",async()=>{
    for(const [error,status] of [["conversation_unavailable",403],["message_conflict",409],["message_rate_limited",429],["secret SQL",503]] as const){
      fetcher.mockResolvedValueOnce(Response.json(user)).mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json({code:"P0001",message:error},{status:400}));
      const response=await app.request(`/v1/me/messages/${target}`,{method:"PUT",headers,body:JSON.stringify({id,body:"hello"})},env);
      expect(response.status).toBe(status);expect(await response.text()).not.toContain("secret SQL");
    }
  });
});
