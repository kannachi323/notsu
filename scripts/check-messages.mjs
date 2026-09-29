import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";

export async function checkMessages({check,request,createAccount,publicClient,admin,a,b,suffix}) {
  const c=await createAccount("message-outsider");
  await request("/v1/me/profile",c.token,{username:`msg_${suffix}`,displayName:"Message outsider",bio:""});
  const send=(actor,target,body,id=randomUUID())=>request(`/v1/me/messages/${target.id}`,actor.token,{id,body});
  const list=(actor,target)=>request(`/v1/me/messages/${target.id}`,actor.token);
  const connect=async()=>{
    const result=await request(`/v1/me/connections/${b.id}`,a.token,{action:"send"});
    const edge=(await result.json()).connection;
    if(edge.state==="outgoing")assert.equal((await request(`/v1/me/connections/${a.id}`,b.token,{action:"accept",expectedId:edge.id})).status,200);
  };
  const channels=[];
  const eventsA=[],eventsB=[],eventsC=[];
  async function subscribe(actor,topic,events,expected="SUBSCRIBED") {
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("Realtime subscription timed out")),10000);
      const channel=actor.client.channel(topic,{config:{private:true}}).on("postgres_changes",{event:"*",schema:"public",table:"account_updates"},payload=>events.push(payload));
      channels.push([actor.client,channel]);
      channel.subscribe((state,error)=>{
        if(state===expected){clearTimeout(timer);resolve(channel);}
        else if(state==="CHANNEL_ERROR"||state==="TIMED_OUT"){clearTimeout(timer);reject(new Error(`Realtime subscription failed: ${state} ${error?.message??""}`));}
      });
    });
  }
  async function eventAfter(events,start,predicate=()=>true) {
    const end=Date.now()+25000;
    while(!events.slice(start).some(predicate) && Date.now()<end)await new Promise(resolve=>setTimeout(resolve,40));
    assert.ok(events.slice(start).some(predicate),"Expected an authorized live update");
  }
  try {
    await check("private messages enforce identity, friendship and immutable idempotent content",async()=>{
      assert.equal((await request(`/v1/me/messages/${b.id}`)).status,401);
      assert.equal((await send(c,a,"not friends")).status,403);
      assert.equal((await request(`/v1/me/messages/${b.id}`,a.token,{id:randomUUID(),body:"forged",senderId:c.id})).status,400);
      const id=randomUUID(),body="A moving triangle 🎵\n<script>render as text</script>";
      const replies=await Promise.all([send(a,b,body,id),send(a,b,body,id)]);
      assert.deepEqual(replies.map(r=>r.status),[200,200]);
      assert.deepEqual(await replies[0].json(),await replies[1].json());
      assert.equal((await send(a,b,"different body",id)).status,409);
      assert.equal((await b.client.from("direct_messages").select("*")).data.length,1);
      assert.deepEqual((await c.client.from("direct_messages").select("*")).data,[]);
      assert.equal((await a.client.from("direct_messages").insert({sender_id:a.id,recipient_id:b.id,id:randomUUID(),sequence:2,body:"bypass"})).error?.code,"42501");
    });
    await check("message history, unread positions and Unicode bodies round-trip through real services",async()=>{
      const receipt=await send(b,a,"🎵".repeat(2000));assert.equal(receipt.status,200);
      const history=await (await list(a,b)).json();assert.equal(history.items.length,2);assert.equal(history.items[0].body.length,4000);
      const inbox=await (await request("/v1/me/conversations",a.token)).json();assert.equal(inbox.items.find(item=>item.userId===b.id).unread,1);
      assert.equal((await request(`/v1/me/messages/${b.id}/read`,a.token,{sequence:history.items[0].sequence})).status,200);
      assert.equal((await (await request("/v1/me/conversations",a.token)).json()).items.find(item=>item.userId===b.id).unread,0);
    });
    await check("private realtime admits only own topic and emits sanitized owner-only hints",async()=>{
      await subscribe(c,`account:${a.id}`,[],"CHANNEL_ERROR");
      await subscribe(a,`account:${a.id}`,eventsA);await subscribe(b,`account:${b.id}`,eventsB);await subscribe(c,`account:${c.id}`,eventsC);
      const startA=eventsA.length,startB=eventsB.length;
      assert.equal((await send(a,b,"Live update")).status,200);
      const revisionA=(await admin.from("account_updates").select("revision").eq("user_id",a.id).single()).data.revision;
      const revisionB=(await admin.from("account_updates").select("revision").eq("user_id",b.id).single()).data.revision;
      await eventAfter(eventsA,startA,event=>event.new.revision===revisionA);await eventAfter(eventsB,startB,event=>event.new.revision===revisionB);
      assert.ok(eventsA.every(event=>event.new.user_id===a.id));assert.ok(eventsB.every(event=>event.new.user_id===b.id));
      assert.deepEqual(Object.keys(eventsA.at(-1).new).sort(),["revision","user_id"]);assert.equal(eventsC.length,0);
    });
    await check("a concurrent block and send cannot leave readable history or permit later messages",async()=>{
      for(let i=0;i<4;i++){
        const ops=[()=>send(a,b,`race ${i}`),()=>request(`/v1/me/connections/${a.id}`,b.token,{action:"block"})];
        const results=await Promise.all((i%2?ops.reverse():ops).map(run=>run()));
        assert.ok(results.every(result=>[200,403].includes(result.status)));
        assert.equal((await list(a,b)).status,403);assert.equal((await list(b,a)).status,403);
        assert.deepEqual((await a.client.from("direct_messages").select("*")).data,[]);
        assert.equal((await send(a,b,"after block")).status,403);
        const own=(await (await request(`/v1/me/connections/${a.id}`,b.token)).json()).connection;
        await request(`/v1/me/connections/${a.id}`,b.token,{action:"unblock",expectedId:own.id});
        assert.equal((await list(a,b)).status,403); // unblock is not friendship
        await connect();
      }
    });
    await check("existing realtime sockets stop receiving after a ban while another subscriber still receives",async()=>{
      // Wait for prior committed hints to drain before testing a new revision.
      const forbiddenRevision=randomUUID(),controlRevision=randomUUID();
      assert.equal((await admin.auth.admin.updateUserById(b.id,{ban_duration:"1h"})).error,null);
      assert.equal((await admin.from("account_updates").update({revision:forbiddenRevision}).eq("user_id",b.id)).error,null);
      const before=eventsA.length;
      assert.equal((await admin.from("account_updates").update({revision:controlRevision}).eq("user_id",a.id)).error,null);
      await eventAfter(eventsA,before,event=>event.new.revision===controlRevision);
      await new Promise(resolve=>setTimeout(resolve,600));
      assert.equal(eventsB.some(event=>event.new.revision===forbiddenRevision),false);
      assert.equal((await list(b,a)).status,403);
      assert.equal((await admin.auth.admin.updateUserById(b.id,{ban_duration:"none"})).error,null);
    });
    await check("a revoked JWT on an independently authenticated websocket loses access immediately",async()=>{
      const rogue=publicClient(),events=[];
      await rogue.auth.getSession();await rogue.realtime.setAuth(c.token);
      await subscribe({client:rogue},`account:${c.id}`,events);
      const first=randomUUID();
      assert.equal((await admin.from("account_updates").upsert({user_id:c.id,revision:first})).error,null);
      await eventAfter(events,0,event=>event.new.revision===first);
      assert.equal((await c.client.auth.signOut({scope:"local"})).error,null);
      const forbidden=randomUUID(),control=randomUUID(),start=eventsA.length;
      assert.equal((await admin.from("account_updates").update({revision:forbidden}).eq("user_id",c.id)).error,null);
      assert.equal((await admin.from("account_updates").update({revision:control}).eq("user_id",a.id)).error,null);
      await eventAfter(eventsA,start,event=>event.new.revision===control);
      assert.equal(events.some(event=>event.new.revision===forbidden),false);
      assert.ok([401,403].includes((await list(c,a)).status));
    });
    await check("account deletion removes both sides of message history and leaks no realtime delete",async()=>{
      const d=await createAccount("message-delete");
      await request("/v1/me/profile",d.token,{username:`mdel_${suffix}`,displayName:"Disposable messenger",bio:""});
      const edge=(await (await request(`/v1/me/connections/${d.id}`,a.token,{action:"send"})).json()).connection;
      await request(`/v1/me/connections/${a.id}`,d.token,{action:"accept",expectedId:edge.id});
      assert.equal((await send(d,a,"Delete with my account")).status,200);
      assert.equal((await admin.auth.admin.deleteUser(d.id)).error,null);
      assert.deepEqual((await admin.from("direct_messages").select("id").or(`sender_id.eq.${d.id},recipient_id.eq.${d.id}`)).data,[]);
      assert.equal((await list(a,d)).status,403);
      assert.ok([...eventsA,...eventsB,...eventsC].every(event=>event.eventType!=="DELETE"));
    });
  }finally{
    await Promise.all(channels.map(([client,channel])=>client.removeChannel(channel)));
    // A denied channel can leave an SDK reconnect timer after unsubscribe.
    for(const client of new Set(channels.map(([client])=>client)))client.realtime.disconnect();
  }
}
