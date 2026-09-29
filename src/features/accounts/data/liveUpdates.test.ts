import {beforeEach,afterEach,describe,it,expect,vi} from "vitest";
import {acceptIdentity} from "../accountStore";
import {watchAccountUpdates} from "./liveUpdates";
const mock=vi.hoisted(()=>({channel:vi.fn(),remove:vi.fn()}));
vi.mock("./auth",()=>({accountClient:()=>({channel:mock.channel,removeChannel:mock.remove})}));
const owner="11111111-1111-4111-8111-111111111111";
describe("private live invalidations",()=>{
  const changed=vi.fn(),status=vi.fn(),handlers:Array<()=>void>=[];
  let subscription:(state:string)=>void;
  const channel={on:vi.fn((_type,_filter,handler)=>{handlers.push(handler);return channel;}),subscribe:vi.fn(callback=>{subscription=callback;return channel;})};
  beforeEach(()=>{acceptIdentity({id:owner,email:"local@example.test"});handlers.length=0;mock.channel.mockReturnValue(channel);mock.remove.mockResolvedValue("ok");});
  afterEach(()=>{acceptIdentity(null);vi.clearAllMocks();});
  it("uses a private own-user channel, only insert/update hints, and refetches on reconnect",()=>{
    const stop=watchAccountUpdates(owner,changed,status);
    expect(mock.channel).toHaveBeenCalledWith(`account:${owner}`,{config:{private:true}});
    expect(channel.on.mock.calls.map(call=>call[1])).toEqual(["INSERT","UPDATE"].map(event=>({event,schema:"public",table:"account_updates",filter:`user_id=eq.${owner}`})));
    subscription("SUBSCRIBED");expect(changed).toHaveBeenCalledOnce();expect(status).toHaveBeenLastCalledWith("live");
    subscription("CHANNEL_ERROR");expect(status).toHaveBeenLastCalledWith("offline");
    subscription("SUBSCRIBED");expect(changed).toHaveBeenCalledTimes(2);stop();expect(mock.remove).toHaveBeenCalledWith(channel);
  });
  it("ignores callbacks after account changes and after disposal",()=>{
    const stop=watchAccountUpdates(owner,changed,status);acceptIdentity(null);handlers[0]();subscription("SUBSCRIBED");expect(changed).not.toHaveBeenCalled();
    acceptIdentity({id:owner,email:"local@example.test"});stop();handlers[1]();expect(changed).not.toHaveBeenCalled();
  });
});
