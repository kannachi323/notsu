// Real local Auth + PostgREST + PostgreSQL + workerd. No hosted URL override.
import assert from "node:assert/strict";
import { checkFriends } from "./check-friends.mjs";
import { execFileSync, spawn } from "node:child_process";
import { createWriteStream, mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:net";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { stdio: ["ignore", "pipe", "ignore"] }));
assert.equal(status.API_URL, "http://127.0.0.1:55321", "Only the notsu local stack may be tested.");
const key = status.PUBLISHABLE_KEY ?? status.ANON_KEY;
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const publicClient = () => createClient(status.API_URL, key, options);
const accounts = [];
let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };
const suffix = randomUUID().replaceAll("-", "").slice(0, 8);
const password = `local-only-${randomUUID()}`;
// Do not accidentally test a different process already listening on this port.
const probe = createServer();
probe.listen({ host: "127.0.0.1", port: 8791, exclusive: true });
await once(probe, "listening");
await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
mkdirSync(".tools/online", { recursive: true });
// Explicit env file overrides ambient .dev.vars; secrets never appear in command
// arguments or committed config. This disposable file is private to this test run.
const secretDirectory = mkdtempSync(".tools/online/account-test-");
const secretFile = `${secretDirectory}/worker.env`;
writeFileSync(secretFile, `SUPABASE_SECRET_KEY=${status.SERVICE_ROLE_KEY}\n`, { mode: 0o600 });
const log = createWriteStream(".tools/online/integration-worker.log", { flags: "w" });
const worker = spawn(process.execPath, ["node_modules/wrangler/bin/wrangler.js", "dev", "--local", "--port", "8791",
  "--env-file", secretFile,
  "--var", `SUPABASE_PUBLISHABLE_KEY:${key}`, "--var", `SUPABASE_URL:${status.API_URL}`,
  "--var", "ALLOWED_ORIGINS:http://127.0.0.1:1420"], { stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, WRANGLER_SEND_METRICS: "false", CI: "true" } });
worker.stdout.pipe(log);
worker.stderr.pipe(log);
const endpoint = "http://127.0.0.1:8791";
async function request(path, token, body) {
  return fetch(`${endpoint}${path}`, { method: body ? "PUT" : "GET",
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(10_000) });
}
async function createAccount(label, verified = true) {
  const email = `${label}-${suffix}@example.invalid`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: verified });
  assert.equal(error, null, "local fixture creation failed");
  accounts.push(data.user.id);
  const client = publicClient();
  const login = await client.auth.signInWithPassword({ email, password });
  return { id: data.user.id, email, client, token: login.data.session?.access_token, login };
}
const deletion = (token, body = { confirmation: "DELETE" }) => fetch(`${endpoint}/v1/me/account`, {
  method: "DELETE", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  body: JSON.stringify(body), signal: AbortSignal.timeout(20_000),
});

try {
  const deadline = Date.now() + 30_000;
  let ready = false;
  while (Date.now() < deadline && worker.exitCode === null) {
    try {
      const response = await request("/health");
      ready = response.ok && (await response.json()).service === "notsu-api";
    } catch { /* Worker is still starting. */ }
    if (ready) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(ready, "Local Worker did not start; inspect .tools/online/integration-worker.log.");
  const a = await createAccount("account-a");
  const b = await createAccount("account-b");
  assert.ok(a.token && b.token, "Verified fixtures must sign in through real Auth.");
  const profileA = { username: `one_${suffix}`, displayName: "Player One 🎵", bio: "Local integration check" };
  const profileB = { username: `two_${suffix}`, displayName: "Player Two", bio: "" };

  await check("missing identity is denied", async () => {
    assert.equal((await request("/v1/me/profile")).status, 401);
  });
  await check("unverified email cannot sign in", async () => {
    const unverified = await createAccount("unverified", false);
    assert.equal(unverified.token, undefined);
    assert.equal(unverified.login.error?.code, "email_not_confirmed");
  });
  await check("signed-in user starts without an invented profile", async () => {
    const result = await request("/v1/me/profile", a.token);
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), { profile: null });
  });
  await check("verified accounts create and update their own profiles", async () => {
    assert.equal((await request("/v1/me/profile", a.token, profileA)).status, 200);
    assert.equal((await request("/v1/me/profile", b.token, profileB)).status, 200);
    const result = await request("/v1/me/profile", a.token, { ...profileA, bio: "Updated" });
    assert.equal(result.status, 200);
    assert.equal((await result.json()).profile.id, a.id);
  });
  await check("public profiles omit private account data", async () => {
    const result = await request(`/v1/profiles/${profileA.username}`);
    assert.equal(result.status, 200);
    const body = (await result.json()).profile;
    assert.deepEqual(Object.keys(body).sort(), ["bio", "createdAt", "displayName", "id", "updatedAt", "username"]);
    assert.equal(body.bio, "Updated");
  });
  await check("username conflicts are explicit", async () => {
    const result = await request("/v1/me/profile", b.token, profileA);
    assert.equal(result.status, 409);
    assert.equal((await result.json()).error.code, "username_taken");
  });
  await check("direct PostgREST cannot edit another account", async () => {
    const changed = await b.client.from("profiles").update({ bio: "Forged" }).eq("id", a.id).select();
    assert.equal(changed.error, null);
    assert.deepEqual(changed.data, []);
    const own = await request("/v1/me/profile", a.token);
    assert.equal((await own.json()).profile.bio, "Updated");
  });
  await check("direct PostgREST cannot forge timestamps or delete a profile", async () => {
    const changed = await a.client.from("profiles").update({ created_at: "2000-01-01" }).eq("id", a.id);
    assert.equal(changed.error?.code, "42501");
    assert.equal((await a.client.from("profiles").delete().eq("id", a.id)).error?.code, "42501");
  });
  await check("edited JWT claims do not change the caller", async () => {
    const parts = a.token.split(".");
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    parts[1] = Buffer.from(JSON.stringify({ ...claims, sub: b.id })).toString("base64url");
    assert.equal((await request("/v1/me/profile", parts.join("."))).status, 401);
  });
  await check("simultaneous username claims have exactly one winner", async () => {
    const shared = { ...profileA, username: `race_${suffix}` };
    const results = await Promise.all([request("/v1/me/profile", a.token, shared), request("/v1/me/profile", b.token, shared)]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  });
  await checkFriends({ check, request, createAccount, admin, a, b, suffix });
  await check("sign-out revokes API writes and direct database writes", async () => {
    assert.equal((await a.client.auth.signOut({ scope: "local" })).error, null);
    const result = await request("/v1/me/profile", a.token, profileA);
    assert.ok([401, 403].includes(result.status));
    const stale = createClient(status.API_URL, key, { ...options, global: { headers: { Authorization: `Bearer ${a.token}` } } });
    const write = await stale.rpc("save_profile", { p_username: profileA.username, p_display_name: "Stale", p_bio: "" });
    assert.equal(write.error?.code, "42501");
    assert.ok([401,403].includes((await request("/v1/me/connections", a.token)).status));
    assert.deepEqual((await stale.from("friendships").select("*")).data, []);
  });
  await check("bans take effect for an existing authenticated session", async () => {
    assert.equal((await admin.auth.admin.updateUserById(b.id, { ban_duration: "1h" })).error, null);
    assert.ok([401, 403].includes((await request("/v1/me/profile", b.token, profileB)).status));
    const write = await b.client.rpc("save_profile", { p_username: profileB.username, p_display_name: "Banned", p_bio: "" });
    assert.equal(write.error?.code, "42501");
    assert.ok([401,403].includes((await request("/v1/me/connections", b.token)).status));
    assert.deepEqual((await b.client.from("friendships").select("*")).data, []);
  });
  const c = await createAccount("delete-account");
  const profileC = { username: `del_${suffix}`, displayName: "Disposable player", bio: "Local deletion check" };
  assert.equal((await request("/v1/me/profile", c.token, profileC)).status, 200);
  const otherSession = publicClient();
  assert.equal((await otherSession.auth.signInWithPassword({ email: c.email, password })).error, null);
  const otherAuthSession = (await otherSession.auth.getSession()).data.session;
  const otherToken = otherAuthSession.access_token;
  // Keep an unrotated token from a separate session, so the later failure proves
  // deletion revoked it rather than an earlier refresh having consumed it.
  const refreshToken = otherAuthSession.refresh_token;
  assert.equal((await request("/v1/me/profile", otherToken)).status, 200);
  await check("deletion rejects caller-selected victims and incomplete confirmation", async () => {
    assert.equal((await deletion(c.token, { confirmation: "DELETE", id: b.id })).status, 400);
    assert.equal((await deletion(c.token, { confirmation: "delete" })).status, 400);
    assert.equal((await admin.auth.admin.getUserById(c.id)).error, null);
  });
  await check("an incorrect password cannot produce deletion authorization", async () => {
    assert.equal((await publicClient().auth.signInWithPassword({ email: c.email, password: "wrong-local-password" })).error?.code, "invalid_credentials");
    assert.equal((await admin.auth.admin.getUserById(c.id)).error, null);
  });
  await check("edited password proof claims fail real signature verification", async () => {
    const parts = c.token.split(".");
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString());
    parts[1] = Buffer.from(JSON.stringify({ ...claims, amr: [{ method: "password", timestamp: 1 }] })).toString("base64url");
    assert.equal((await deletion(parts.join("."))).status, 401);
  });
  await check("an old password proof is denied after a genuine token refresh", async () => {
    // Age only this disposable fixture's authentication method, then let Auth sign
    // the refreshed JWT. This exercises real claims without sleeping for two minutes.
    const claims = JSON.parse(Buffer.from(c.token.split(".")[1], "base64url").toString());
    assert.match(claims.session_id, /^[0-9a-f-]{36}$/);
    execFileSync("docker", ["exec", "supabase_db_notsu-local", "psql", "-U", "postgres", "-d", "postgres", "-X", "-v", "ON_ERROR_STOP=1", "-c",
      `update auth.mfa_amr_claims set updated_at = now() - interval '10 minutes' where session_id = '${claims.session_id}' and authentication_method = 'password'`], { stdio: "pipe" });
    const refreshed = await c.client.auth.refreshSession();
    assert.equal(refreshed.error, null);
    const result = await deletion(refreshed.data.session.access_token);
    assert.equal(result.status, 403);
    assert.equal((await result.json()).error.code, "reauthentication_required");
  });
  await check("fresh password confirmation hard-deletes the account and public profile", async () => {
    const fresh = await c.client.auth.signInWithPassword({ email: c.email, password });
    assert.equal(fresh.error, null);
    assert.equal((await deletion(fresh.data.session.access_token)).status, 204);
    assert.equal((await admin.auth.admin.getUserById(c.id)).error?.code, "user_not_found");
    assert.equal((await request(`/v1/profiles/${profileC.username}`)).status, 404);
  });
  await check("deleted accounts lose old sessions, refresh tokens and direct database writes", async () => {
    assert.ok([401, 403].includes((await request("/v1/me/profile", otherToken)).status));
    const stale = createClient(status.API_URL, key, { ...options, global: { headers: { Authorization: `Bearer ${otherToken}` } } });
    assert.equal((await stale.rpc("save_profile", { p_username: profileC.username, p_display_name: "Stale", p_bio: "" })).error?.code, "42501");
    assert.ok((await publicClient().auth.refreshSession({ refresh_token: refreshToken })).error);
    assert.equal((await publicClient().auth.signInWithPassword({ email: c.email, password })).error?.code, "invalid_credentials");
    assert.ok([401, 403].includes((await deletion(c.token)).status));
    assert.equal((await admin.auth.admin.getUserById(b.id)).error, null);
  });
  console.log(`${checks} real online integration checks passed.`);
} finally {
  for (const id of accounts) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error && error.code !== "user_not_found") { console.error("Could not remove a local test account."); process.exitCode = 1; }
  }
  if (worker.exitCode === null) {
    const stopped = once(worker, "exit");
    worker.kill("SIGTERM");
    await stopped;
  }
  log.end();
  rmSync(secretDirectory, { recursive: true });
}
