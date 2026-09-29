import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../../app";
const owner="11111111-1111-4111-8111-111111111111",target="22222222-2222-4222-8222-222222222222",edge="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const env={SUPABASE_URL:"https://auth.test",SUPABASE_PUBLISHABLE_KEY:"sb_publishable_test",SUPABASE_SECRET_KEY:"sb_secret_unused",ALLOWED_ORIGINS:"http://127.0.0.1:1420"};
const headers={Authorization:"Bearer verified.user.token","Content-Type":"application/json"};
const user={id:owner,role:"authenticated",email:"owner@example.test",email_confirmed_at:"2026-01-01",is_anonymous:false};
describe("friends API boundary",()=>{
  const fetcher=vi.fn<typeof fetch>();
  beforeEach(()=>{vi.stubGlobal("fetch",fetcher);fetcher.mockImplementation(async(input)=>{
    const url=String(input);if(url.endsWith('/auth/v1/user'))return Response.json(user);
    if(url.endsWith('/rpc/account_is_active'))return Response.json(true);
    if(url.endsWith('/rpc/get_connection')||url.endsWith('/rpc/change_connection'))return Response.json({state:'outgoing',id:edge});
    if(url.endsWith('/rpc/list_connections'))return Response.json([]);
    throw new Error('Unexpected service request');
  });});
  afterEach(()=>{vi.unstubAllGlobals();fetcher.mockReset();});
  it("protects list, lookup and mutations with the shared live-session guard",async()=>{
    for(const [path,method] of [["/v1/me/connections","GET"],[`/v1/me/connections/${target}`,"GET"],[`/v1/me/connections/${target}`,"PUT"]])expect((await app.request(path,{method},env)).status).toBe(401);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("keeps the caller JWT and public key for database-enforced transitions",async()=>{
    const result=await app.request(`/v1/me/connections/${target}`,{method:"PUT",headers,body:JSON.stringify({action:"send"})},env);
    expect(result.status).toBe(200);
    expect(JSON.parse(String(fetcher.mock.calls[2][1]?.body))).toEqual({p_target:target,p_action:"send",p_expected_id:null});
    expect(fetcher.mock.calls.every(([,init])=>new Headers(init?.headers).get("apikey")===env.SUPABASE_PUBLISHABLE_KEY)).toBe(true);
  });
  it("rejects injected owners, invalid targets and partial pagination before any social RPC",async()=>{
    expect((await app.request(`/v1/me/connections/${target}`,{method:"PUT",headers,body:JSON.stringify({action:"send",owner:target})},env)).status).toBe(400);
    expect((await app.request('/v1/me/connections/not-a-uuid',{headers},env)).status).toBe(400);
    expect((await app.request(`/v1/me/connections?list=friends&beforeId=${edge}`,{headers},env)).status).toBe(400);
    expect(fetcher.mock.calls.filter(([url])=>String(url).includes("_connection"))).toHaveLength(0);
  });
  it("maps stale and rate-limited transitions without leaking SQL details",async()=>{
    for(const [message,status] of [["connection_changed",409],["request_rate_limited",429],["private_sql_detail",503],["constructor",503]] as const){
      fetcher.mockResolvedValueOnce(Response.json(user)).mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json({code:"P0001",message},{status:400}));
      const response=await app.request(`/v1/me/connections/${target}`,{method:"PUT",headers,body:JSON.stringify({action:"send"})},env);
      expect(response.status).toBe(status);expect(await response.text()).not.toContain("private_sql_detail");
    }
  });
  it("returns only 50 public player summaries and a cursor for the lookahead",async()=>{
    const rows=Array.from({length:51},(_,i)=>({id:`aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12,"0")}`,user_id:target,username:"player_two",display_name:"Two",created_at:"2026-09-29T10:11:12.123456+00:00",state:"friends",email:"hidden@example.test"}));
    fetcher.mockResolvedValueOnce(Response.json(user)).mockResolvedValueOnce(Response.json(true)).mockResolvedValueOnce(Response.json(rows));
    const result=await app.request('/v1/me/connections?list=friends',{headers},env),body=await result.json();
    expect(body.items).toHaveLength(50);expect(body.next).toEqual({id:rows[49].id,time:rows[49].created_at});
    expect(JSON.stringify(body)).not.toContain("hidden@example.test");
  });
});
