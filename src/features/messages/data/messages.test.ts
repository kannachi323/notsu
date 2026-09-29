import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {acceptIdentity} from "../../accounts/accountStore";
import {sendMessage,loadMessages,loadInbox,markRead} from "./messages";
const mock=vi.hoisted(()=>({session:vi.fn()}));
vi.mock("../../accounts/data/auth",()=>({configuration:{apiUrl:"https://api.test"},accountClient:()=>({auth:{getSession:mock.session}}),authError:()=>new Error("Session unavailable"),AccountError:class extends Error{constructor(message:string,public code="unavailable"){super(message);}}}));
const owner="11111111-1111-4111-8111-111111111111",target="22222222-2222-4222-8222-222222222222",id="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const message={id,senderId:owner,sequence:"1",body:"hello",createdAt:"2026-09-29T01:02:03.123456Z"};
describe("private message client",()=>{
  const fetcher=vi.fn<typeof fetch>();
  beforeEach(()=>{vi.stubGlobal("fetch",fetcher);acceptIdentity({id:owner,email:"test@example.test"});mock.session.mockResolvedValue({data:{session:{access_token:"token",user:{id:owner}}},error:null});});
  afterEach(()=>{acceptIdentity(null);vi.unstubAllGlobals();fetcher.mockReset();mock.session.mockReset();});
  it("sends the same immutable ID when retrying an uncertain delivery",async()=>{
    fetcher.mockRejectedValueOnce(new Error("lost"));await expect(sendMessage(target,{id,body:"hello"})).rejects.toThrow("Retry the same");
    expect(fetcher).toHaveBeenCalledOnce();
    fetcher.mockResolvedValueOnce(Response.json({message}));await sendMessage(target,{id,body:"hello"});
    expect(fetcher.mock.calls.map(([,init])=>init?.body)).toEqual([JSON.stringify({id,body:"hello"}),JSON.stringify({id,body:"hello"})]);
    expect(fetcher.mock.calls[0][1]).toMatchObject({credentials:"omit",cache:"no-store",headers:{Authorization:"Bearer token"}});
  });
  it("rejects mismatched sessions before requests and changed identity after parsing",async()=>{
    mock.session.mockResolvedValueOnce({data:{session:{user:{id:target}}}});await expect(loadInbox()).rejects.toThrow("Sign in");expect(fetcher).not.toHaveBeenCalled();
    const response=Response.json({});response.json=async()=>{acceptIdentity({id:target,email:"other@example.test"});return {items:[message],next:null};};fetcher.mockResolvedValue(response);
    await expect(loadMessages(target)).rejects.toThrow("account changed");
  });
  it("checks receipt identity and content before claiming success",async()=>{
    for(const receipt of [{...message,body:"wrong"},{...message,senderId:target},{...message,id:target}]){
      fetcher.mockResolvedValueOnce(Response.json({message:receipt}));await expect(sendMessage(target,{id,body:"hello"})).rejects.toThrow("receipt");
    }
  });
  it("rejects invented pages, duplicate positions and alien senders",async()=>{
    for(const page of [{items:[message,message],next:null},{items:[{...message,senderId:id}],next:null},{items:[message],next:"1"},{items:[]}]){
      fetcher.mockResolvedValueOnce(Response.json(page));await expect(loadMessages(target)).rejects.toThrow();
    }
  });
  it("keeps large integer cursors exact and sends only a read position",async()=>{
    fetcher.mockResolvedValue(Response.json({items:[],next:null}));await loadMessages(target,"9007199254740993");
    expect(String(fetcher.mock.calls[0][0])).toContain("before=9007199254740993");
    fetcher.mockResolvedValueOnce(Response.json({ok:true}));await markRead(target,"9");expect(fetcher.mock.calls[1][1]?.body).toBe('{"sequence":"9"}');
  });
  it("never displays raw upstream errors or inherited error-map properties",async()=>{
    for(const code of ["constructor","__proto__","unknown"]){fetcher.mockResolvedValue(Response.json({error:{code,message:"private SQL"}},{status:503}));await expect(loadInbox()).rejects.toThrow("could not complete");}
  });
});
