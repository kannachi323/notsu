import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";

async function until(predicate) {
  const deadline = Date.now() + 4000;
  while (!predicate()) {
    assert.ok(Date.now() < deadline, "Timed out waiting for the local database race barrier");
    await new Promise(resolve => setTimeout(resolve, 40));
  }
}

// Hold the same row that a review locks. Start real direct-API writes while the
// row is locked, prove they are waiting, then commit the actual review RPC.
async function restrictWhileWritesWait({ sql, target, moderator, report }) {
  const process = spawn("docker", ["exec", "-i", "supabase_db_notsu-local", "psql", "-U", "postgres", "-d", "postgres", "-XAtq", "-v", "ON_ERROR_STOP=1"], { stdio: "pipe" });
  let output = "", errors = "";
  process.stdout.on("data", chunk => { output += chunk; });
  process.stderr.on("data", chunk => { errors += chunk; });
  const closed = new Promise((resolve, reject) => { process.on("error", reject); process.on("close", code => resolve(code)); });
  const claims = JSON.parse(Buffer.from(moderator.token.split(".")[1], "base64url").toString());
  assert.match(claims.session_id, /^[0-9a-f-]{36}$/);
  let pending = [];
  try {
    process.stdin.write(`begin;\nselect pg_backend_pid();\nselect id from public.profiles where id='${target.id}' for update;\n\\echo profile_locked\n`);
    await until(() => output.includes("profile_locked"));
    const pid = Number(output.trim().split("\n")[0]); assert.ok(Number.isSafeInteger(pid) && pid > 0);
    pending = [
      target.client.from("profiles").update({ bio: "Late direct edit" }).eq("id", target.id).then(value => value),
      target.client.rpc("save_profile", { p_username: target.username, p_display_name: "Late RPC edit", p_bio: "Late RPC edit" }).then(value => value),
      target.client.rpc("renew_presence", { p_client: randomUUID(), p_sequence: 1, p_visible: true }).then(value => value),
    ];
    await until(() => Number(sql(`with recursive waiting(pid) as (
      select pid from pg_stat_activity where ${pid}=any(pg_blocking_pids(pid))
      union select a.pid from pg_stat_activity a join waiting w on w.pid=any(pg_blocking_pids(a.pid))
    ) select count(*) from waiting`).toString().match(/\n\s*(\d+)\s*\n/)?.[1]) === 3);
    process.stdin.end(`set local role authenticated;\nselect set_config('request.jwt.claims','{"sub":"${moderator.id}","session_id":"${claims.session_id}","role":"authenticated"}',true);\nselect public.review_report('${report.id}','${report.revision}','${randomUUID()}','restrict_7d','Local concurrency verification');\ncommit;\n`);
    assert.equal(await closed, 0, errors);
    const [direct, rpc, presence] = await Promise.all(pending);
    assert.equal(direct.error?.code, "42501"); assert.equal(rpc.error?.code, "42501");
    assert.equal(presence.error, null); assert.equal(presence.data.validForMs, 0);
  } finally {
    // EOF rolls an unfinished transaction back and releases every waiting request.
    if (!process.stdin.writableEnded) process.stdin.end();
    await closed; await Promise.allSettled(pending);
  }
}

export async function checkModeration({ check, request, createAccount, admin, deletion, suffix }) {
  const a = await createAccount("report-author"), b = await createAccount("report-target"), moderator = await createAccount("report-reviewer"), outsider = await createAccount("report-outsider");
  const identities = [a, b, moderator, outsider];
  for (const [index, actor] of identities.entries()) {
    assert.match(actor.id, /^[0-9a-f-]{36}$/);
    assert.equal((await request("/v1/me/profile", actor.token, { username: `rpt${index}_${suffix}`, displayName: `Report player ${index}`, bio: "Original local test profile" })).status, 200);
  }
  const sql = statement => execFileSync("docker", ["exec", "supabase_db_notsu-local", "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-c", statement], { stdio: "pipe" });
  const connect = async () => {
    const edge = (await (await request(`/v1/me/connections/${b.id}`, a.token, { action: "send" })).json()).connection;
    assert.equal((await request(`/v1/me/connections/${a.id}`, b.token, { action: "accept", expectedId: edge.id })).status, 200);
  };
  const context = (actor, message = null) => request(`/v1/me/reports/context?target=${b.id}${message ? `&message=${message}` : ""}`, actor.token);
  const detail = id => request(`/v1/me/moderation/reports/${id}`, moderator.token);
  const decide = (report, action, note = "Local test review", id = randomUUID()) => request(`/v1/me/moderation/reports/${report.id}`, moderator.token, { id, revision: report.revision, action, note });
  const messageId = randomUUID(), reportId = randomUUID();
  let reviewed;
  try {
    await connect();
    assert.equal((await request(`/v1/me/messages/${a.id}`, b.token, { id: messageId, body: "Synthetic received evidence 🎵" })).status, 200);
    await check("reports capture only authorized server evidence and atomically apply optional blocking", async () => {
      assert.equal((await context(outsider, messageId)).status, 403);
      assert.equal((await request(`/v1/me/reports/context?target=${b.id}`)).status, 401);
      const payload = { id: reportId, targetId: b.id, messageId, reason: "other", details: "A local synthetic concern", block: true };
      assert.equal((await request("/v1/me/reports", a.token, { ...payload, evidence: { body: "fabricated" } })).status, 400);
      const results = await Promise.all([request("/v1/me/reports", a.token, payload), request("/v1/me/reports", a.token, payload)]);
      assert.deepEqual(results.map(result => result.status), [200, 200]); assert.deepEqual(await results[0].json(), await results[1].json());
      assert.equal((await request(`/v1/me/messages/${b.id}`, a.token)).status, 403);
      assert.equal((await context(a, messageId)).status, 200); // known received evidence after block
      assert.equal((await (await request("/v1/me/reports", b.token)).json()).items.length, 0);
      const own = (await (await request("/v1/me/reports", a.token)).json()).items; assert.equal(own.length, 1); assert.equal(own[0].id, reportId);
      assert.equal("evidence" in own[0], false); assert.equal("reporterId" in own[0], false);
      assert.equal((await request("/v1/me/reports", a.token, { ...payload, details: "changed" })).status, 409);
    });
    await check("moderation role comes only from trusted database membership, never metadata", async () => {
      assert.equal((await admin.auth.admin.updateUserById(moderator.id, { user_metadata: { moderator: true, role: "admin" } })).error, null);
      assert.equal((await (await request("/v1/me/moderation/access", moderator.token)).json()).moderator, false);
      assert.equal((await request("/v1/me/moderation/reports", moderator.token)).status, 403);
      assert.equal((await detail(reportId)).status, 403);
      sql(`insert into private.moderators(user_id) values('${moderator.id}')`);
      assert.equal((await (await request("/v1/me/moderation/access", moderator.token)).json()).moderator, true);
      const result = await detail(reportId); assert.equal(result.status, 200); reviewed = await result.json();
      assert.equal(reviewed.evidence.message.body, "Synthetic received evidence 🎵"); assert.equal(reviewed.reporterId, a.id);
      assert.equal((await request(`/v1/me/moderation/reports/${reportId}`, b.token)).status, 403);
    });
    await check("concurrent review decisions have one winner and retry does not duplicate action", async () => {
      const edge = (await (await request(`/v1/me/connections/${b.id}`, a.token)).json()).connection;
      assert.equal((await request(`/v1/me/connections/${b.id}`, a.token, { action: "unblock", expectedId: edge.id })).status, 200);
      await connect();
      const commands = ["First reviewer decision", "Second reviewer decision"].map(note => ({ id: randomUUID(), revision: reviewed.revision, action: "restrict_7d", note }));
      const results = await Promise.all(commands.map(body => request(`/v1/me/moderation/reports/${reportId}`, moderator.token, body)));
      assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
      const winner = results.findIndex(result => result.status === 200); reviewed = await results[winner].json();
      assert.equal(reviewed.actions.length, 1);
      const retry = await request(`/v1/me/moderation/reports/${reportId}`, moderator.token, commands[winner]);
      assert.equal(retry.status, 200); assert.deepEqual(await retry.json(), reviewed);
    });
    await check("community restrictions protect direct data and social routes while retaining account controls", async () => {
      assert.equal((await request(`/v1/profiles/rpt1_${suffix}`)).status, 404);
      assert.equal((await request("/v1/me/profile", b.token)).status, 200);
      const own = await (await request("/v1/me/moderation/access", b.token)).json();
      assert.ok(own.restriction.until); assert.ok(own.restriction.note); assert.equal("reporterId" in own, false);
      const write = await b.client.rpc("save_profile", { p_username: `rpt1_${suffix}`, p_display_name: "Changed", p_bio: "not allowed" }); assert.equal(write.error?.code, "42501");
      assert.deepEqual((await a.client.from("profiles").select("id").eq("id", b.id)).data, []);
      assert.equal((await request(`/v1/me/messages/${a.id}`, b.token, { id: randomUUID(), body: "blocked by restriction" })).status, 403);
      assert.equal((await (await request("/v1/me/presence", b.token, { clientId: randomUUID(), sequence: 1, visible: true })).json()).validForMs, 0);
      const result = await decide(reviewed, "lift_restriction", "Restriction corrected"); assert.equal(result.status, 200); reviewed = await result.json();
      assert.equal(reviewed.actions.length, 2); assert.equal((await request(`/v1/profiles/rpt1_${suffix}`)).status, 200);
      assert.equal((await request(`/v1/me/messages/${a.id}`, b.token, { id: randomUUID(), body: "restored" })).status, 200);
    });
    await check("writes already waiting on a profile cannot pass a newly committed restriction", async () => {
      const id = randomUUID();
      assert.equal((await request("/v1/me/reports", a.token, { id, targetId: b.id, messageId: null, reason: "other", details: "Local concurrency verification", block: false })).status, 200);
      const report = await (await detail(id)).json();
      await restrictWhileWritesWait({ sql, target: { ...b, username: `rpt1_${suffix}` }, moderator, report });
      const profile = (await (await request("/v1/me/profile", b.token)).json()).profile;
      assert.equal(profile.bio, "Original local test profile"); assert.equal(profile.displayName, "Report player 1");
      assert.equal((await decide(await (await detail(id)).json(), "lift_restriction", "Concurrency verification complete")).status, 200);
    });
    await check("profile cleanup rejects outdated evidence and resets only the reviewed profile", async () => {
      const submit = async () => {
        const id = randomUUID();
        assert.equal((await request("/v1/me/reports", a.token, { id, targetId: b.id, messageId: null, reason: "other", details: "Profile test concern", block: false })).status, 200);
        return (await detail(id)).json();
      };
      const stale = await submit();
      assert.equal((await request("/v1/me/profile", b.token, { username: `rpt1_${suffix}`, displayName: "Updated player", bio: "New content" })).status, 200);
      assert.equal((await decide(stale, "clear_profile")).status, 409);
      const fresh = await submit(); assert.equal((await decide(fresh, "clear_profile", "Profile content removed after review")).status, 200);
      const profile = (await (await request("/v1/me/profile", b.token)).json()).profile;
      assert.match(profile.username, /^player_/); assert.equal(profile.bio, ""); assert.equal(profile.displayName, "Player");
      assert.equal((await request(`/v1/profiles/rpt0_${suffix}`)).status, 200);
    });
    await check("deletion removes conversations but preserves disclosed evidence, and role revocation is immediate", async () => {
      assert.equal((await deletion(b.token)).status, 204);
      const retained = await (await detail(reportId)).json(); assert.equal(retained.targetId, null); assert.equal(retained.evidence.message.body, "Synthetic received evidence 🎵");
      assert.deepEqual((await admin.from("direct_messages").select("id").eq("sender_id", b.id)).data, []);
      assert.equal((await deletion(a.token)).status, 204);
      assert.equal((await (await detail(reportId)).json()).reporterId, null);
      sql(`delete from private.moderators where user_id='${moderator.id}'`);
      assert.equal((await detail(reportId)).status, 403);
      assert.equal((await decide(reviewed, "dismiss")).status, 403);
    });
  } finally {
    // Evidence intentionally survives account deletion. Remove only this run's
    // synthetic evidence, including reports whose identity FKs were set null.
    const ids = identities.map(actor => `'${actor.id}'`).join(",");
    sql(`delete from private.reports where reporter_id in(${ids}) or target_id in(${ids}) or evidence->>'targetId'='${b.id}'; delete from private.moderators where user_id='${moderator.id}'`);
  }
}
