import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createServer } from 'vite';

export async function checkMaps({ check, request, createAccount, admin, endpoint, suffix }) {
  const vite = await createServer({ configFile:false, cacheDir:'.tools/map-test-vite', optimizeDeps:{noDiscovery:true}, server:{middlewareMode:true}, appType:'custom' });
  let packed, unpack;
  try {
    const codec = await vite.ssrLoadModule('/src/features/maps/data/package.ts'); unpack = codec.unpackMap;
    const loaded = await unpack(new Uint8Array(readFileSync('public/maps/orbit-signal.notsumap')));
    loaded.set.id = `integration-${suffix}`; loaded.set.title = `Integration Signal ${suffix}`;
    packed = await codec.packMap(loaded.set, loaded.audio);
  } finally { await vite.close(); }
  const a = await createAccount('map-publisher'), b = await createAccount('map-reviewer');
  for (const [account, label] of [[a,'mapper'],[b,'reviewer']]) {
    assert.equal((await request('/v1/me/profile', account.token, { username:`${label}_${suffix}`, displayName:label, bio:'' })).status,200);
  }
  const sql = command => execFileSync('docker',['exec','-i','supabase_db_notsu-local','psql','-U','postgres','-d','postgres','-XAt','-v','ON_ERROR_STOP=1'],{input:command,encoding:'utf8',stdio:['pipe','pipe','pipe']}).trim();
  for (const id of [a.id,b.id]) assert.match(id,/^[a-f0-9-]{36}$/);
  const uploadId = randomUUID(), path = `/v1/maps/${packed.revision}`;
  const upload = (account, id=uploadId) => fetch(`${endpoint}/v1/me/maps/${packed.revision}?uploadId=${id}&rights=confirmed`, {
    method:'PUT',headers:{Authorization:`Bearer ${account.token}`,'Content-Type':'application/octet-stream'},body:packed.bytes,signal:AbortSignal.timeout(20000),
  });
  const visible = (account, version, value) => request(`/v1/me/maps/${packed.revision}/visibility`,account.token,{version,visible:value});
  const contentHash = createHash('sha256').update(packed.bytes).digest('hex');
  let published, hidden, restored;
  await check('complete map publication validates a real archive and stores it in local R2',async()=>{
    const response = await upload(a); const body = await response.json(); assert.equal(response.status,200,JSON.stringify(body)); published=body;
    assert.equal(published.publisherId,a.id); assert.equal(published.revision,packed.revision); assert.equal(published.archiveSha256,contentHash);
    assert.equal(published.difficulties.length,2);
    const result = await request(`${path}/pack`); assert.equal(result.status,200);
    const bytes = new Uint8Array(await result.arrayBuffer());
    assert.equal(createHash('sha256').update(bytes).digest('hex'),contentHash);
    assert.equal((await unpack(bytes)).revision,packed.revision);
    assert.equal(result.headers.get('cache-control'),'private, no-store');
  });
  await check('guest map search finds real published metadata without account secrets or rank',async()=>{
    const response=await request(`/v1/maps?q=${suffix}`); assert.equal(response.status,200);
    const body=await response.json(); assert.equal(body.items.length,1); assert.equal(body.items[0].revision,packed.revision);
    for(const key of ['token','email','session','ranked','rating']) assert.equal(key in body.items[0],false);
  });
  await check('publication retries preserve one immutable revision and archive',async()=>{
    for(const id of [uploadId,randomUUID()]) { const response=await upload(a,id); assert.equal(response.status,200); assert.deepEqual(await response.json(),published); }
    assert.equal((await (await request('/v1/me/maps',a.token)).json()).items.length,1);
    assert.equal((await upload(b)).status,409);
    const forged=await b.client.rpc('complete_map_upload',{p_id:uploadId,p_owner:a.id,p_session:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',p_revision:packed.revision,p_metadata:{},p_sha256:contentHash,p_bytes:packed.bytes.length});
    assert.equal(forged.error?.code,'42501');
  });
  await check('withdrawal and stale-safe restoration gate actual media downloads',async()=>{
    assert.equal((await visible(b,published.version,false)).status,404);
    const result=await visible(a,published.version,false); assert.equal(result.status,200); hidden=await result.json();
    assert.equal((await request(path)).status,404); assert.equal((await request(`${path}/pack`)).status,404);
    assert.equal((await (await upload(a)).json()).visible,false);
    assert.equal((await visible(a,published.version,true)).status,409);
    const restore=await visible(a,hidden.version,true); assert.equal(restore.status,200); restored=await restore.json();
    assert.equal((await request(`${path}/pack`)).status,200);
  });
  await check('a database-authorized map removal cannot be bypassed by the publisher',async()=>{
    sql(`insert into private.moderators(user_id) values('${b.id}');`);
    const action={id:randomUUID(),version:restored.version,hidden:true,note:'Synthetic moderation check'};
    const denied=await request(`/v1/me/moderation/maps/${packed.revision}`,a.token,action); assert.equal(denied.status,403);
    const response=await request(`/v1/me/moderation/maps/${packed.revision}`,b.token,action); assert.equal(response.status,200); const removed=await response.json();
    assert.equal((await request(`${path}/pack`)).status,404);
    assert.equal((await visible(a,removed.version,true)).status,403);
    assert.equal((await (await upload(a)).json()).moderated,true);
    const retry=await request(`/v1/me/moderation/maps/${packed.revision}`,b.token,action); assert.equal(retry.status,200); assert.deepEqual(await retry.json(),removed);
    const release=await request(`/v1/me/moderation/maps/${packed.revision}`,b.token,{id:randomUUID(),version:removed.version,hidden:false,note:'Synthetic decision cleared'}); assert.equal(release.status,200);
    assert.equal((await request(`${path}/pack`)).status,200);
  });
  await check('sign-out after reservation prevents a slow upload from becoming public',async()=>{
    const c=await createAccount('map-revoked'); assert.match(c.id,/^[a-f0-9-]{36}$/);
    assert.equal((await request('/v1/me/profile',c.token,{username:`revoked_${suffix}`,displayName:'Revoked',bio:''})).status,200);
    const codec=await createServer({configFile:false,cacheDir:'.tools/map-test-vite',optimizeDeps:{noDiscovery:true},server:{middlewareMode:true},appType:'custom'});
    let second;
    try { const api=await codec.ssrLoadModule('/src/features/maps/data/package.ts'); const loaded=await api.unpackMap(packed.bytes); loaded.set.id+= '-revoked'; second=await api.packMap(loaded.set,loaded.audio); }
    finally { await codec.close(); }
    const id=randomUUID(); let controller;
    const body=new ReadableStream({start(value){controller=value;controller.enqueue(second.bytes.slice(0,64));}});
    const pending=fetch(`${endpoint}/v1/me/maps/${second.revision}?uploadId=${id}&rights=confirmed`,{method:'PUT',headers:{Authorization:`Bearer ${c.token}`,'Content-Type':'application/octet-stream'},body,duplex:'half',signal:AbortSignal.timeout(15000)});
    void pending.catch(()=>undefined);
    let reserved=false;
    try {
      const deadline=Date.now()+5000;
      while(Date.now()<deadline){if(sql(`select count(*) from private.map_uploads where id='${id}';`)==='1'){reserved=true;break;} await new Promise(resolve=>setTimeout(resolve,40));}
      assert.equal(reserved,true,'The real API must have authenticated and reserved before revocation.');
      assert.equal((await c.client.auth.signOut({scope:'local'})).error,null);
      controller.enqueue(second.bytes.slice(64)); controller.close();
      assert.equal((await pending).status,403);
      assert.equal((await request(`/v1/maps/${second.revision}/pack`)).status,404);
    } finally { try { controller.close(); } catch { /* Already closed. */ } }
  });
  await check('account deletion immediately stops map distribution and clears ownership',async()=>{
    assert.equal((await admin.auth.admin.deleteUser(a.id)).error,null);
    assert.equal((await request(path)).status,404); assert.equal((await request(`${path}/pack`)).status,404);
    assert.equal(sql(`select count(*) from private.map_sets where owner_id='${a.id}';`),'0');
  });
}
