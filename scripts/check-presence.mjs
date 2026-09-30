import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";

export async function checkPresence({ check, request, createAccount, publicClient, admin, password, suffix }) {
  const a = await createAccount("presence-a"), b = await createAccount("presence-b"), outsider = await createAccount("presence-outsider");
  for (const [actor, label] of [[a,"a"],[b,"b"],[outsider,"c"]]) assert.equal((await request("/v1/me/profile", actor.token, { username: `prs_${label}_${suffix}`, displayName: `Presence ${label}`, bio: "" })).status, 200);
  const clientId = randomUUID(), secondId = randomUUID();
  const settings = (actor, visibility) => request("/v1/me/presence/settings", actor.token, visibility ? { visibility } : undefined);
  const pulse = (actor, client, sequence, visible = true) => request("/v1/me/presence", actor.token, { clientId: client, sequence, visible });
  const lookup = async (viewer, target) => {
    const response = await request(`/v1/me/presence?players=${target.id}`, viewer.token); assert.equal(response.status, 200);
    return (await response.json()).items[0];
  };
  const connect = async () => {
    const edge = (await (await request(`/v1/me/connections/${b.id}`, a.token, { action: "send" })).json()).connection;
    assert.equal((await request(`/v1/me/connections/${a.id}`, b.token, { action: "accept", expectedId: edge.id })).status, 200);
  };
  await connect();
  const subscriptions = [], eventsB = [], eventsOutsider = [];
  const subscribe = (actor, events) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Presence subscription timed out")), 10000);
    const channel = actor.client.channel(`account:${actor.id}`, { config: { private: true } }).on("postgres_changes", { event: "*", schema: "public", table: "account_updates" }, event => events.push(event));
    subscriptions.push([actor.client, channel]);
    channel.subscribe(state => {
      if (state === "SUBSCRIBED") { clearTimeout(timer); resolve(); }
      else if (["CHANNEL_ERROR", "TIMED_OUT"].includes(state)) { clearTimeout(timer); reject(new Error(`Presence channel failed: ${state}`)); }
    });
  });
  const waitForRevision = async (events, revision) => {
    const end = Date.now() + 25000;
    while (!events.some(event => event.new.revision === revision) && Date.now() < end) await new Promise(resolve => setTimeout(resolve, 40));
    assert.ok(events.some(event => event.new.revision === revision), "Friend should receive its own invalidation");
  };
  const second = publicClient();
  try {
    await check("presence starts hidden and rejects forged ownership and anonymous lookups", async () => {
      assert.deepEqual(await (await settings(a)).json(), { visibility: "hidden" });
      assert.deepEqual(await (await pulse(a, clientId, 1)).json(), { visibility: "hidden", validForMs: 0 });
      assert.deepEqual(await lookup(b, a), { userId: a.id, online: false, validForMs: 0 });
      assert.equal((await request(`/v1/me/presence?players=${a.id}`)).status, 401);
      assert.equal((await request("/v1/me/presence", a.token, { clientId, sequence: 2, visible: true, userId: b.id })).status, 400);
    });
    await check("visible presence reaches only accepted friends through opaque owner-only hints", async () => {
      await subscribe(b, eventsB); await subscribe(outsider, eventsOutsider);
      assert.equal((await settings(a, "friends")).status, 200);
      const result = await pulse(a, clientId, 2); assert.equal(result.status, 200);
      const own = await result.json(); assert.ok(own.validForMs > 0 && own.validForMs <= 90000);
      const revision = (await admin.from("account_updates").select("revision").eq("user_id", b.id).single()).data.revision;
      await waitForRevision(eventsB, revision);
      const known = await lookup(b, a); assert.equal(known.online, true); assert.equal(known.validForMs % 5000, 0);
      assert.deepEqual(Object.keys(known).sort(), ["online", "userId", "validForMs"]);
      assert.deepEqual(await lookup(outsider, a), { userId: a.id, online: false, validForMs: 0 });
      assert.equal(eventsOutsider.length, 0); assert.ok(eventsB.every(event => event.new.user_id === b.id && event.eventType !== "DELETE"));
      assert.deepEqual(Object.keys(eventsB.at(-1).new).sort(), ["revision", "user_id"]);
    });
    await check("ordered releases survive delayed renewals and independent clients", async () => {
      assert.equal((await pulse(a, secondId, 1)).status, 200);
      assert.equal((await pulse(a, clientId, 4, false)).status, 200);
      assert.equal((await pulse(a, clientId, 3)).status, 200);
      assert.equal((await lookup(b, a)).online, true); // second window remains
      assert.equal((await pulse(a, secondId, 2, false)).status, 200);
      assert.equal((await lookup(b, a)).online, false);
      assert.equal((await pulse(a, clientId, 5)).status, 200);
      assert.match(a.id, /^[0-9a-f-]{36}$/);
      // Expire only this disposable fixture, without waiting 90 real seconds.
      execFileSync("docker", ["exec", "supabase_db_notsu-local", "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-c", `update private.presence_leases set expires_at=now()-interval '1 second' where user_id='${a.id}'`], { stdio: "pipe" });
      assert.equal((await lookup(b, a)).online, false);
    });
    await check("signing out one real Auth session preserves another client's lease", async () => {
      const login = await second.auth.signInWithPassword({ email: a.email, password }); assert.equal(login.error, null);
      const other = { token: login.data.session.access_token }, id = randomUUID();
      assert.equal((await pulse(a, clientId, 6)).status, 200); assert.equal((await pulse(other, id, 1)).status, 200);
      assert.equal((await second.auth.signOut({ scope: "local" })).error, null);
      assert.equal((await lookup(b, a)).online, true);
      assert.ok([401, 403].includes((await pulse(other, id, 2)).status));
      assert.equal((await pulse(a, clientId, 7, false)).status, 200);
      assert.equal((await lookup(b, a)).online, false);
    });
    await check("hiding clears all clients and a delayed heartbeat cannot restore visibility", async () => {
      assert.equal((await pulse(a, clientId, 8)).status, 200); assert.equal((await pulse(a, secondId, 3)).status, 200);
      assert.equal((await settings(a, "hidden")).status, 200);
      assert.deepEqual(await (await pulse(a, clientId, 9)).json(), { visibility: "hidden", validForMs: 0 });
      assert.equal((await lookup(b, a)).online, false);
      const revision = (await admin.from("account_updates").select("revision").eq("user_id", b.id).single()).data.revision;
      await waitForRevision(eventsB, revision);
    });
    await check("blocks, bans and final session revocation hide an otherwise active player", async () => {
      assert.equal((await settings(a, "friends")).status, 200); assert.equal((await pulse(a, clientId, 10)).status, 200);
      assert.equal((await request(`/v1/me/connections/${a.id}`, b.token, { action: "block" })).status, 200);
      assert.equal((await lookup(b, a)).online, false);
      const edge = (await (await request(`/v1/me/connections/${a.id}`, b.token)).json()).connection;
      assert.equal((await request(`/v1/me/connections/${a.id}`, b.token, { action: "unblock", expectedId: edge.id })).status, 200);
      assert.equal((await lookup(b, a)).online, false); await connect(); assert.equal((await lookup(b, a)).online, true);
      assert.equal((await admin.auth.admin.updateUserById(a.id, { ban_duration: "1h" })).error, null);
      assert.equal((await lookup(b, a)).online, false); assert.ok([401, 403].includes((await pulse(a, clientId, 11)).status));
      assert.equal((await admin.auth.admin.updateUserById(a.id, { ban_duration: "none" })).error, null);
      assert.equal((await pulse(a, clientId, 12)).status, 200); assert.equal((await lookup(b, a)).online, true);
      assert.equal((await a.client.auth.signOut({ scope: "local" })).error, null);
      assert.equal((await lookup(b, a)).online, false); assert.ok([401, 403].includes((await settings(a)).status));
    });
  } finally {
    await second.auth.signOut({ scope: "local" });
    await Promise.all(subscriptions.map(([client, channel]) => client.removeChannel(channel)));
    for (const client of new Set(subscriptions.map(([client]) => client))) client.realtime.disconnect();
  }
}
