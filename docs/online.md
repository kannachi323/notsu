# Online foundation

The full account/community release is still in progress. The account screen at
`/#/account` implements sign-up, email verification, sign-in, recovery, profile
editing, sign-out and permanent account deletion against real Supabase Auth and
the Hono API. Public player pages at `/#/players/:username` work while signed out;
`/#/players` looks up exact usernames. A deleted or renamed profile releases its
former handle, which can be reused. Handles are current addresses, not permanent
identity links. Services
are configured at build time; an unconfigured build explains that online accounts
are unavailable. No hosted account service has been deployed. Existing guest/offline
gameplay, maps and records continue independently.

## Identity and session decision

Use Supabase email/password authentication with email confirmation. The initial
client session lives **only in memory** in both browsers and the Tauri webview:
`persistSession: false`, `detectSessionInUrl: false`, refresh while the app is open.
Passwords are never saved. Reloading the page or closing the app requires another
sign-in; switching game routes must retain the single app-owned client. This is an
explicit UX tradeoff explained on the sign-in screen. A single lazily initialized
SDK client owns credentials; the small account UI store contains identity/profile
state only. The account route and SDK are loaded separately from the initial game.

Do not persist access/refresh tokens in localStorage, IndexedDB, ordinary desktop
files, logs or URLs. This avoids an unreviewed persistent secret store, but memory
tokens are still accessible to injected JavaScript: CSP, dependency review and
text-only rendering of user content remain required. A future opt-in persistent
session would need a separate design and platform tests: a same-site HttpOnly
browser session service and native OS credential storage. Do not silently switch
Supabase persistence on to implement “remember me”.

Confirmation/recovery use user-entered email codes with the matching Supabase OTP
type. The committed email templates include codes and no authentication links, so
the hash router and desktop launch protocol never carry raw session tokens. The
forms handle invalid codes, resend cooldowns, matching passwords and generic
recovery responses. A verified recovery session opens the new-password form;
cancelling signs out. The Sign out action explicitly uses `scope: 'local'`.

Profile editing displays errors/retry and guards unsaved changes on navigation,
sign-out and browser unload. Pending loads cannot overwrite a newer save or another
account's profile. A profile-service outage retains account identity and offers
retry; local play remains accessible. Native close/unload behavior and long-running
network/refresh stress tests still need broader platform coverage. Local profile
reporting and moderation are implemented; optional persistent sessions and further
account controls remain unfinished.

## Implemented API

The entry is `server/app.ts`; feature routes/adapters live under
`server/features/accounts/`. Pure profile validation is shared from
`src/features/accounts/domain/`. No server dependency is imported by the game.

| Request | Behaviour |
| --- | --- |
| `GET /health` | Process liveness only, not database or Auth readiness |
| `GET /v1/profiles/:username` | Public profile, or 404 |
| `GET /v1/me/profile` | Verified caller's profile, or `null` before onboarding |
| `PUT /v1/me/profile` | Atomically create/update username, display name and bio |
| `DELETE /v1/me/account` | Fresh password proof + explicit confirmation; permanently delete caller |

Profile requests accept JSON `{ username, displayName, bio }` only. Usernames
normalize to lowercase and use 3–20 ASCII letters, digits or underscores, starting
with a letter. Display names use 1–40 Unicode characters; bios allow 280 and ordinary
newlines. Control characters are rejected. Request bodies are bounded to 4 KiB of
actual UTF-8 bytes and five seconds. Service fetches have five-second deadlines.
Unknown profile fields, including owner IDs, roles, ratings and timestamps, are
rejected. Username uniqueness is atomic; conflicts return 409. Bios are plain text,
never HTML. The profile UI renders them as text.

Protected routes accept only bearer tokens, validate identity against Supabase
Auth, and then check a live verified account/session in PostgreSQL. Cookies,
caller-supplied account IDs and user-editable metadata cannot establish identity.
Every request gets its own non-persisting Supabase client. Database calls retain
the user's JWT and a publishable/anon key. The ordinary data client rejects
secret/service-role keys. The API requires exact allowed origins; it does not enable credentialed
CORS. CORS is not authorization. Sensitive responses use `private, no-store`, and
unexpected errors log only a request ID/event, never raw provider errors or tokens.

## Database boundary

The migration creates `public.profiles`, explicitly revokes broad client grants,
enables RLS and grants only public reads plus owner inserts/updates on editable
columns. Profiles contain public ID/handle/name/bio/timestamps only; email and
authentication data stay in Supabase's private `auth` schema. Public profiles remain
public even if the viewer is signed out; blocking is not a privacy control for
these already-public fields. Banned, unverified and community-restricted profiles
are hidden from public reads. A live verified owner retains their own profile read
during a community restriction. See [moderation](moderation.md).

The private, fixed-search-path `account_is_active` helper checks the current
authenticated user against a matching `auth.sessions` row, verified email,
anonymous status, soft deletion, ban and session expiry. Both RLS writes and the
API use that check, so directly calling PostgREST does not bypass it. Client writes
cannot change identity/timestamps or delete an account. `save_profile` is a
security-invoker RPC with column-limited writes; it does not elevate callers.
Hard deletion of an Auth user cascades their profile, sessions, friendships,
blocks, request counters and both sides of its private message history/read
positions. Existing report evidence and review history survive under the disclosed
90/180-day retention policy in [moderation](moderation.md); deletion clears identity
foreign keys but does not anonymize captured evidence. Published-map, score and
production-backup deletion policies remain release work.

Friends and blocking now use a separate migration and feature boundary; see
[friends and authorization](friends.md). Protected feature endpoints share the
account live-session middleware. [Private messages and live updates](messages.md)
and [friends-only presence](presence.md) are implemented locally. Private
[reports and review](moderation.md) now cover profiles and received messages.
Rankings, map publishing, uploads and their administrative endpoints remain
unfinished. Add grants/RLS and
adversarial tests in the same migration as each future feature.

## Permanent account deletion

The account screen links to a separate confirmation page. Unsaved profile edits
are guarded before navigation; deletion itself blocks navigation while pending.
The user enters their current password and the exact word `DELETE`. The password
goes directly to Supabase Auth through an isolated memory-only client with its
own session namespace; it never goes to the Worker. The app requires the fresh
session's user ID to match the signed-in identity and rechecks that identity
before sending the destructive request.

The Worker first verifies the exact bearer token through Auth and the live-session
check, then reads its signed `amr` claim. Password authentication must be no more
than 120 seconds old (five seconds of future clock tolerance); token `iat`, refresh,
recovery, and user-editable metadata cannot satisfy this check. This limits an old
session's ability to delete; possession of a fresh password-authenticated token is
still sufficient during that window. Do not present this as protection against all
token theft. Clients cannot supply a target user ID or a password in the body.

Only the deletion adapter accepts the optional server-only `SUPABASE_SECRET_KEY`
binding and calls `auth.admin.deleteUser(verifiedUserId, false)`. It never exposes
a general administrative route or uses this key for ordinary profile/RLS requests.
Without this binding, deletion fails closed while ordinary account features keep
working. For hosted deployments provision it as a Worker secret, never as `VITE_*`,
Rust configuration, a committed variable or a command-line argument.

A confirmed deletion returns 204 and drops the app's memory session. The client
never retries deletion automatically or reports success for an uncertain response.
After an ambiguous upstream error the server performs one account lookup and can
confirm success only when Auth explicitly says the account is absent. Otherwise
the UI explains that the result could not be confirmed and asks the player to
check sign-in. Repeated requests after deletion are denied by normal authentication;
there is no persistent deletion receipt yet. Failed attempts best-effort sign out
the temporary proof session; network outages can prevent that cleanup. Local maps,
drafts, skins, preferences and records are independent and remain on the device.
Before confirmation, the UI discloses retained report evidence and its scheduled
removal. This includes reported message/profile copies even though the original
conversation and profile rows are deleted.

## Local development and verification

Requires the installed Supabase CLI, Docker and the locked npm dependencies. The
local project is `notsu-local`, separate from hosted projects and other local stacks.
Ports: API 55321, PostgreSQL 55322, email test inbox 55324, Worker 8787. The compact
stack enables Auth/PostgREST/database/Realtime/email capture; storage, Studio and
analytics remain disabled. Local email stays in Mailpit.

```sh
supabase start
supabase migration up --local
npm run test:db
npm run test:online
npm run test:email
npm test
npm run api:build
```

`test:db` runs transactional pgTAP authorization tests that roll back all fixtures.
`test:online` refuses a non-local Supabase URL, starts a temporary Worker on port
8791, creates real local Auth accounts, signs in using passwords and tests API and
direct PostgREST access, password freshness, deletion and stale-token denial.
It deletes its accounts and stops its Worker in `finally`. A fixture-only SQL update
ages one authentication method before a real refresh; this test depends on the
installed local Auth schema and never modifies a preview/user account.
The test supplies a local admin key to its temporary Worker through a private
ignored env file, solely for deletion. It removes that file afterward. The key
never enters command arguments, the frontend, Rust or committed configuration.
Ignored `.tools/online/` contains diagnostic output. No hosted
Supabase project or Cloudflare account is touched. Do not pass hosted credentials
to these local fixtures. The tests require the local stack to be running; they do
not silently skip when it is absent.

`test:email` creates a disposable local account, reads only its captured Mailpit
messages, verifies and reuses an email code, refreshes the session, completes a
password reset and checks old/new password behavior. It removes its Auth identity
and captured messages. It refuses non-local service URLs and never delivers email
outside Mailpit.

For interactive API development, copy `.dev.vars.example` to `.dev.vars` and set
the local publishable/anon key from `supabase status`. Deletion also requires the
local secret/service-role key in the separate `SUPABASE_SECRET_KEY` binding. Keep
this file private (mode 0600), then run
`npm run api:dev`. `.dev.vars` is ignored. `supabase stop` stops this project's
containers while preserving its database volume. `api:build` performs type checking
and a Worker dry run only; it does not publish. The Worker configuration has no
public routes and disables workers.dev/preview URLs.

To connect the browser frontend, copy `.env.example` to ignored `.env.local` and set
`VITE_SUPABASE_URL=http://127.0.0.1:55321`,
`VITE_NOTSU_API_URL=http://127.0.0.1:8787`, and the local publishable key in
`VITE_SUPABASE_PUBLISHABLE_KEY`. Restart Vite if it does not reload the environment.
The Vite configuration validates these values before bundling and rejects
secret/service-role keys, remote plain HTTP, embedded credentials and URL tokens.
These public values are deliberately compiled into the app, not runtime secrets.

The default native CSP stays offline-only until real deployment origins exist.
Use the explicit local-only CSP overlay for native verification:

```sh
npm run tauri -- build --debug --bundles app --config src-tauri/tauri.local.conf.json
```

The overlay permits only the two loopback services, without filesystem, shell or
other new native capabilities. It is a development configuration, not a production
release setting. Hosted URLs/CSP/CORS, SMTP templates and recovery delivery must
be configured and tested together before shipping.

The Miniflare development dependency pins vulnerable Undici 7.29.0; package.json
overrides it to patched 7.29.1. Recheck and remove that override when upstream
adopts a patched version. The lockfile includes both client and server tooling.

## Gates before exposure to the public

The local community now includes friends, private messaging, private realtime
invalidations, opt-in [friends-only presence](presence.md), and private
[reports/moderation](moderation.md). Reports use private evidence/action tables,
database-authorized reviewers and a daily retention job. Neither report content
nor raw presence is published. No new native capability or hosted origin is needed
for local verification.

Finish the remaining account controls and cross-platform flows; wire exact hosted
CSP/CORS origins, recovery templates and HTTPS service URLs. Establish staging/production,
SMTP delivery, migrations/backups/restore/rollback, monitored failure handling,
rate limits/anti-abuse, moderation operations and load tests. Direct Supabase access also needs
an abuse-control strategy: limiting Worker traffic alone does not limit PostgREST.
Public name reservations, renaming/impersonation policy, staff MFA, appeals and
operator escalation still need completion. Do not deploy this local configuration
as a production service. Define and disclose backup/audit retention and the handling of published maps,
messages, reports and rankings on deletion before those features go live. The
current flow deletes Auth/profile rows; it is not a promise of immediate erasure
from future backups or third-party logs. No production project, domain, credentials, billing,
signing or public deployment has been configured.

## Research

Reviewed official documentation September 29, 2026:

- [Supabase sessions](https://supabase.com/docs/guides/auth/sessions): JWTs can
  outlive sign-out; live session checks close that gap for protected operations.
- [Auth getUser](https://supabase.com/docs/reference/javascript/auth-getuser):
  verifies identity against the Auth service instead of trusting decoded claims.
- [Row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security):
  grants and RLS both constrain access, including direct Data API calls.
- [Auth session storage](https://supabase.com/docs/guides/auth/server-side/advanced-guide):
  SDK defaults and cookie/refresh considerations; the memory-only client decision
  above is notsu's choice, not a requirement of Supabase.
- [Auth deletion](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser)
  and [user management](https://supabase.com/docs/guides/auth/managing-user-data):
  server-only hard deletion, cascading sessions and the remaining JWT expiry window.
- [JWT claims](https://supabase.com/docs/guides/auth/jwt-fields): signed password
  authentication timestamps are separate from access-token issuance/refresh.
- [Sign-out scopes](https://supabase.com/docs/guides/auth/signout).
- [Local database migrations](https://supabase.com/docs/guides/local-development/database-migrations).
- [Hono on Workers](https://hono.dev/docs/getting-started/cloudflare-workers).
- [Cloudflare rate-limit bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/):
  limits are per key and Cloudflare location; a binding alone is not a global quota.
