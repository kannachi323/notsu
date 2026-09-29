import assert from 'node:assert/strict';

// Called inside test:online's guarded local Worker/Auth fixture lifecycle.
export async function checkFriends({ check, request, createAccount, admin, a, b, suffix }) {
  const outsider = await createAccount('friend-outsider');
  assert.equal((await request('/v1/me/profile', outsider.token, { username: `outsider_${suffix}`, displayName: 'Outside player', bio: '' })).status, 200);
  const change = (owner, target, action, expectedId) => request(`/v1/me/connections/${target.id}`, owner.token, { action, ...(expectedId ? { expectedId } : {}) });
  const read = async (owner, target) => {
    const result = await request(`/v1/me/connections/${target.id}`, owner.token);
    assert.equal(result.status, 200); return (await result.json()).connection;
  };
  const list = async (owner, kind) => {
    const result = await request(`/v1/me/connections?list=${kind}`, owner.token);
    assert.equal(result.status, 200); return (await result.json()).items;
  };
  await check('friend requests require verified identity and reject owner injection', async () => {
    assert.equal((await request('/v1/me/connections')).status, 401);
    assert.equal((await request(`/v1/me/connections/${b.id}`, a.token, { action: 'send', actorId: outsider.id })).status, 400);
    assert.equal((await change(a, a, 'send')).status, 400);
  });
  await check('a real friend request is private to its participants', async () => {
    assert.equal((await change(a,b,'send')).status, 200);
    const edge = await read(a,b); assert.equal(edge.state,'outgoing');
    assert.equal((await read(b,a)).state,'incoming');
    assert.equal((await change(a,b,'accept',edge.id)).status,409);
    assert.equal((await list(a,'outgoing')).length,1);
    assert.equal((await list(b,'incoming')).length,1);
    assert.equal((await list(outsider,'incoming')).length,0);
    assert.deepEqual((await outsider.client.from('friendships').select('*')).data,[]);
    assert.equal((await a.client.from('friendships').update({accepted_at:new Date().toISOString()}).eq('id',edge.id)).error?.code,'42501');
    assert.equal((await change(outsider,b,'accept',edge.id)).status,409);
    assert.equal((await change(a,b,'cancel',edge.id)).status,200);
  });
  await check('simultaneous crossed requests produce one pending relationship', async () => {
    const results = await Promise.all([change(a,b,'send'),change(b,a,'send')]);
    assert.deepEqual(results.map(result=>result.status),[200,200]);
    const [one,two] = await Promise.all([read(a,b),read(b,a)]);
    assert.deepEqual([one.state,two.state].sort(),['incoming','outgoing']);
    assert.equal(one.id,two.id);
    const recipient = one.state === 'incoming' ? a : b, sender = recipient === a ? b : a;
    assert.equal((await change(recipient,sender,'accept',one.id)).status,200);
    assert.equal((await change(recipient,sender,'accept',one.id)).status,200);
    assert.equal((await read(a,b)).state,'friends');
    assert.equal((await list(b,'friends')).length,1);
  });
  await check('blocking removes the friendship and blocks requests in both directions', async () => {
    assert.equal((await change(b,a,'block')).status,200);
    assert.equal((await read(b,a)).state,'blocked');
    assert.equal((await read(a,b)).state,'unavailable');
    assert.equal((await list(a,'friends')).length,0);
    assert.equal((await list(b,'blocked')).length,1);
    assert.deepEqual((await a.client.from('blocks').select('*')).data,[]);
    assert.deepEqual((await outsider.client.from('blocks').select('*')).data,[]);
    assert.equal((await change(a,b,'send')).status,403);
    assert.equal((await change(b,a,'send')).status,403);
    const block = await read(b,a);
    assert.equal((await change(b,a,'unblock',block.id)).status,200);
    assert.equal((await read(a,b)).state,'none');
  });
  await check('stale actions cannot accept a newer request or remove a newer block', async () => {
    await change(a,b,'send'); const old = await read(a,b);
    await change(a,b,'cancel',old.id); await change(a,b,'send');
    assert.equal((await change(b,a,'accept',old.id)).status,409);
    await change(b,a,'block'); const block = await read(b,a);
    await change(b,a,'unblock',block.id); await change(b,a,'block');
    assert.equal((await change(b,a,'unblock',block.id)).status,409);
    assert.equal((await read(b,a)).state,'blocked');
    await change(b,a,'unblock',(await read(b,a)).id);
  });
  await check('block versus acceptance races always finish blocked without a friendship', async () => {
    // Repeat with alternating dispatch order; one transaction may accept first,
    // but the committed block must always remove or prevent that relationship.
    for(let index=0;index<6;index++) {
      await change(a,b,'send'); const pending = await read(b,a);
      const results = await Promise.all(index%2 ? [change(b,a,'accept',pending.id),change(a,b,'block')] : [change(a,b,'block'),change(b,a,'accept',pending.id)]);
      assert.ok(results.every(result=>[200,403,409].includes(result.status)));
      assert.equal((await read(a,b)).state,'blocked');
      assert.equal((await list(b,'friends')).length,0);
      assert.equal((await list(b,'incoming')).length,0);
      await change(a,b,'unblock',(await read(a,b)).id);
    }
  });
  await check('simultaneous block and send cannot leave a hidden pending request', async () => {
    const results=await Promise.all([change(a,b,'send'),change(b,a,'block')]);
    assert.ok(results.every(result=>[200,403].includes(result.status)));
    assert.equal((await read(b,a)).state,'blocked');
    await change(b,a,'unblock',(await read(b,a)).id);
    assert.equal((await read(a,b)).state,'none');
  });
  await check('deleting a participant removes their friendships and both block directions', async () => {
    await change(a,outsider,'send'); await change(outsider,a,'accept',(await read(outsider,a)).id);
    await change(b,outsider,'block'); await change(outsider,b,'block');
    assert.equal((await admin.auth.admin.deleteUser(outsider.id)).error,null);
    assert.equal((await list(a,'friends')).some(item=>item.userId===outsider.id),false);
    assert.equal((await list(b,'blocked')).some(item=>item.userId===outsider.id),false);
  });
  // Keep a real relationship for the later revoked-session and ban checks.
  await change(a,b,'send'); await change(b,a,'accept',(await read(b,a)).id);
}
