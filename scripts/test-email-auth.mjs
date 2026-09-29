// Disposable test identities and captured email only; never contacts hosted Auth.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const status = JSON.parse(execFileSync("supabase", ["status", "-o", "json"], { stdio: ["ignore", "pipe", "ignore"] }));
assert.equal(status.API_URL, "http://127.0.0.1:55321");
assert.equal(status.MAILPIT_URL ?? status.INBUCKET_URL, "http://127.0.0.1:55324");
const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
const client = createClient(status.API_URL, status.PUBLISHABLE_KEY, options);
const admin = createClient(status.API_URL, status.SERVICE_ROLE_KEY, options);
const email = `email-check-${randomUUID()}@example.test`;
const original = `old-password-${randomUUID()}`, replacement = `new-password-${randomUUID()}`;
let userId;
const messageIds = [];
let checks = 0;
const check = async (name, run) => { await run(); checks++; console.log(`PASS ${name}`); };

async function code(subject) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const response = await fetch(`http://127.0.0.1:55324/api/v1/search?query=${encodeURIComponent(`to:${email}`)}`, { signal: AbortSignal.timeout(3000) });
    assert.ok(response.ok);
    const data = await response.json();
    const message = data.messages.find(item => item.Subject === subject && item.To.some(to => to.Address === email));
    if (message) {
      const content = await (await fetch(`http://127.0.0.1:55324/api/v1/message/${message.ID}`)).json();
      messageIds.push(message.ID);
      assert.ok(!content.HTML.includes("token_hash") && !content.HTML.includes("access_token"));
      const found = content.Text.match(/\b\d{6}\b/);
      assert.ok(found, "Email must contain a six-digit code.");
      return found[0];
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  throw Error("The local test email did not arrive.");
}

try {
  let confirmation;
  await check("signup sends the code template without signing in", async () => {
    const result = await client.auth.signUp({ email, password: original });
    assert.equal(result.error, null); userId = result.data.user.id;
    assert.equal(result.data.session, null);
    confirmation = await code("Your notsu verification code");
  });
  await check("an invalid verification code is rejected", async () => {
    const invalid = confirmation === "000000" ? "111111" : "000000";
    assert.equal((await client.auth.verifyOtp({ email, token: invalid, type: "email" })).error?.code, "otp_expired");
  });
  await check("the signup code creates a verified session exactly once", async () => {
    const result = await client.auth.verifyOtp({ email, token: confirmation, type: "email" });
    assert.equal(result.error, null); assert.ok(result.data.user.email_confirmed_at);
    assert.ok(result.data.session);
    assert.equal((await client.auth.verifyOtp({ email, token: confirmation, type: "email" })).error?.code, "otp_expired");
  });
  await check("refresh rotates the active session without storage", async () => {
    assert.equal((await client.auth.refreshSession()).error, null);
    assert.ok((await client.auth.getSession()).data.session);
    assert.equal((await client.auth.signOut({ scope: "local" })).error, null);
  });
  let recovery;
  await check("recovery sends a code using the recovery template", async () => {
    assert.equal((await client.auth.resetPasswordForEmail(email)).error, null);
    recovery = await code("Your notsu recovery code");
  });
  await check("recovery verification emits PASSWORD_RECOVERY and permits a password change", async () => {
    const events = [];
    const subscription = client.auth.onAuthStateChange(event => { events.push(event); }).data.subscription;
    try {
      const result = await client.auth.verifyOtp({ email, token: recovery, type: "recovery" });
      assert.equal(result.error, null);
      assert.ok(events.includes("PASSWORD_RECOVERY"));
      assert.equal((await client.auth.updateUser({ password: replacement })).error, null);
    } finally { subscription.unsubscribe(); }
  });
  await check("old password stops working and the new password signs in", async () => {
    assert.equal((await client.auth.signOut({ scope: "local" })).error, null);
    assert.equal((await client.auth.signInWithPassword({ email, password: original })).error?.code, "invalid_credentials");
    assert.equal((await client.auth.signInWithPassword({ email, password: replacement })).error, null);
  });
  console.log(`${checks} real email authentication checks passed.`);
} finally {
  if (userId) assert.equal((await admin.auth.admin.deleteUser(userId)).error, null);
  for (const id of messageIds) await fetch(`http://127.0.0.1:55324/api/v1/messages`, {
    method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ IDs: [id] }),
  });
}
