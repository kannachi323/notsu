import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { acceptIdentity } from "../../accounts/accountStore";
import { changeConnection, getConnection, listConnections } from "./connections";
const mock = vi.hoisted(() => ({ session: vi.fn() }));
vi.mock("../../accounts/data/auth", () => ({ configuration: { apiUrl: "https://api.test" },
  accountClient: () => ({ auth: { getSession: mock.session } }), authError: () => new Error("Session unavailable"),
  AccountError: class extends Error { constructor(message: string, public code = "unavailable") { super(message); } },
}));
const owner="11111111-1111-4111-8111-111111111111", target="22222222-2222-4222-8222-222222222222", edge="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const identity = { id: owner, email: "fixture@example.test" };
describe("private connection requests", () => {
  const fetcher=vi.fn<typeof fetch>();
  beforeEach(()=>{vi.stubGlobal("fetch",fetcher);acceptIdentity(identity);mock.session.mockResolvedValue({data:{session:{access_token:"user-token",user:{id:owner}}},error:null});});
  afterEach(()=>{acceptIdentity(null);vi.unstubAllGlobals();fetcher.mockReset();mock.session.mockReset();});
  it("sends only a narrow action using the caller's token and no cookies",async()=>{
    fetcher.mockResolvedValue(Response.json({connection:{state:"friends",id:edge}}));
    await changeConnection(target,{action:"accept",expectedId:edge});
    expect(fetcher.mock.calls[0]).toMatchObject([`https://api.test/v1/me/connections/${target}`,{method:"PUT",credentials:"omit",cache:"no-store",headers:{Authorization:"Bearer user-token"},body:JSON.stringify({action:"accept",expectedId:edge})}]);
  });
  it("rejects a missing or mismatched session before network access",async()=>{
    mock.session.mockResolvedValue({data:{session:{access_token:"other-token",user:{id:target}}},error:null});
    await expect(getConnection(target)).rejects.toThrow("Sign in"); expect(fetcher).not.toHaveBeenCalled();
  });
  it("never exposes an earlier account's result after identity changes",async()=>{
    fetcher.mockImplementation(async()=>{acceptIdentity({id:target,email:"other@example.test"});return Response.json({connection:{state:"incoming",id:edge}});});
    await expect(getConnection(target)).rejects.toThrow("account changed");
  });
  it("also checks identity after a delayed response body finishes",async()=>{
    const response=Response.json({});
    response.json=async()=>{acceptIdentity({id:target,email:"other@example.test"});return {connection:{state:"friends",id:edge}};};
    fetcher.mockResolvedValue(response);
    await expect(getConnection(target)).rejects.toThrow("account changed");
  });
  it("does not automatically retry an uncertain change or display raw provider messages",async()=>{
    fetcher.mockRejectedValueOnce(new Error("connection lost"));
    await expect(changeConnection(target,{action:"block"})).rejects.toThrow("Refresh before trying again");
    expect(fetcher).toHaveBeenCalledOnce();
    fetcher.mockResolvedValue(Response.json({error:{code:"connection_changed",message:"private SQL"}},{status:409}));
    await expect(changeConnection(target,{action:"accept",expectedId:edge})).rejects.toThrow("connection changed");
    fetcher.mockResolvedValue(Response.json({error:{code:"constructor"}},{status:503}));
    await expect(getConnection(target)).rejects.toThrow("could not complete");
  });
  it("preserves microsecond cursor precision and never includes an owner ID",async()=>{
    fetcher.mockResolvedValue(Response.json({items:[],next:null}));
    await listConnections("incoming",{time:"2026-09-29T10:11:12.123456+00:00",id:edge});
    const url=new URL(String(fetcher.mock.calls[0][0]));
    expect(url.searchParams.get("beforeTime")).toBe("2026-09-29T10:11:12.123456+00:00");expect(url.searchParams.has("owner")).toBe(false);
  });
  it("rejects wrong-list data, duplicates, and fabricated page cursors",async()=>{
    const item={id:edge,userId:target,username:"player_two",displayName:"Two",createdAt:"2026-09-29T10:11:12Z",state:"friends"};
    for(const body of [{items:[{...item,state:"blocked"}],next:null},{items:[item,item],next:null},{items:[],next:{id:edge,time:item.createdAt}},{items:[]}]){
      fetcher.mockResolvedValueOnce(Response.json(body));await expect(listConnections("friends")).rejects.toThrow();
    }
  });
});
