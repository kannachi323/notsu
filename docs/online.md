# Online foundation

The full account/community release is still in progress. This slice implements a
Hono API and real Supabase profile storage, exercised together locally. The game
does not yet expose sign-in or connect to a hosted account service. Existing
guest/offline gameplay, maps and records continue independently.

## Identity and session decision

Use Supabase email/password authentication with email confirmation. The initial
client session will live **only in memory** in both browsers and the Tauri webview:
`persistSession: false`, `detectSessionInUrl: false`, refresh while the app is open.
Passwords are never saved. Reloading the page or closing the app requires another
sign-in; switching game routes must retain the single app-owned client. This is an
explicit UX tradeoff, and the sign-in screen must explain it. No account UI/client
session lifecycle has been implemented yet.

Do not persist access/refresh tokens in localStorage, IndexedDB, ordinary desktop
files, logs or URLs. This avoids an unreviewed persistent secret store, but memory
tokens are still accessible to injected JavaScript: CSP, dependency review and
text-only rendering of user content remain required. A future opt-in persistent
session would need a separate design and platform tests: a same-site HttpOnly
browser session service and native OS credential storage. Do not silently switch
Supabase persistence on to implement “remember me”.

Confirmation/recovery must use a user-entered email code with the correct Supabase
OTP type, so the hash router and desktop launch protocol never carry raw session
tokens. These flows, expired-code retry, password changes, account deletion,
network recovery and sign-out UI still need implementation. A local-only sign-out
must explicitly use `scope: 'local'`; “sign out everywhere” is a separate action.
Native CSP currently remains offline-only and must gain exact approved service
origins when actual account screens are connected.

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

Profile requests accept JSON `{ username, displayName, bio }` only. Usernames
normalize to lowercase and use 3–20 ASCII letters, digits or underscores, starting
with a letter. Display names use 1–40 Unicode characters; bios allow 280 and ordinary
newlines. Control characters are rejected. Request bodies are bounded to 4 KiB of
actual UTF-8 bytes and five seconds. Service fetches have five-second deadlines.
Unknown profile fields, including owner IDs, roles, ratings and timestamps, are
rejected. Username uniqueness is atomic; conflicts return 409. Bios are plain text,
never HTML. The future profile UI must render them as text.

Protected routes accept only bearer tokens, validate identity against Supabase
Auth, and then check a live verified account/session in PostgreSQL. Cookies,
caller-supplied account IDs and user-editable metadata cannot establish identity.
Every request gets its own non-persisting Supabase client. Database calls retain
the user's JWT and a publishable/anon key. The Worker rejects secret/service-role
configuration and requires exact allowed origins; it does not enable credentialed
CORS. CORS is not authorization. Sensitive responses use `private, no-store`, and
unexpected errors log only a request ID/event, never raw provider errors or tokens.

## Database boundary

The migration creates `public.profiles`, explicitly revokes broad client grants,
enables RLS and grants only public reads plus owner inserts/updates on editable
columns. Profiles contain public ID/handle/name/bio/timestamps only; email and
authentication data stay in Supabase's private `auth` schema. Public profiles remain
public even if the viewer is signed out; blocking is not a privacy control for
these already-public fields. Profile hiding/moderation is still pending.

The private, fixed-search-path `account_is_active` helper checks the current
authenticated user against a matching `auth.sessions` row, verified email,
anonymous status, soft deletion, ban and session expiry. Both RLS writes and the
API use that check, so directly calling PostgREST does not bypass it. Client writes
cannot change identity/timestamps or delete an account. `save_profile` is a
security-invoker RPC with column-limited writes; it does not elevate callers.
Hard deletion of an Auth user cascades their profile, but the complete deletion
workflow and retention rules for future community data are not implemented.

No rankings, messages, friends, presence, map publishing, uploads or administrative
endpoints have been exposed in this slice. Add grants/RLS and adversarial tests in
the same migration as each future feature.

## Local development and verification

Requires the installed Supabase CLI, Docker and the locked npm dependencies. The
local project is `notsu-local`, separate from hosted projects and other local stacks.
Ports: API 55321, PostgreSQL 55322, email test inbox 55324, Worker 8787. The compact
stack enables Auth/PostgREST/database/email capture; storage, Realtime, Studio and
analytics are disabled until needed. Local email stays in Mailpit.

```sh
supabase start
supabase migration up --local
npm run test:db
npm run test:online
npm test
npm run api:build
```

`test:db` runs transactional pgTAP authorization tests that roll back all fixtures.
`test:online` refuses a non-local Supabase URL, starts a temporary Worker on port
8791, creates real local Auth accounts, signs in using passwords and tests API and
direct PostgREST access. It deletes its accounts and stops its Worker in `finally`.
It reads the local admin key only into the test process; that key never enters the
Worker or frontend. Ignored `.tools/online/` contains diagnostic output. No hosted
Supabase project or Cloudflare account is touched. Do not pass hosted credentials
to these local fixtures. The tests require the local stack to be running; they do
not silently skip when it is absent.

For interactive API development, copy `.dev.vars.example` to `.dev.vars` and set
only the local publishable/anon key from `supabase status`, then run
`npm run api:dev`. `.dev.vars` is ignored. `supabase stop` stops this project's
containers while preserving its database volume. `api:build` performs type checking
and a Worker dry run only; it does not publish. The Worker configuration has no
public routes and disables workers.dev/preview URLs.

The Miniflare development dependency pins vulnerable Undici 7.29.0; package.json
overrides it to patched 7.29.1. Recheck and remove that override when upstream
adopts a patched version. The lockfile includes both client and server tooling.

## Gates before exposure to the public

Finish account screens and their real browser/native flows; wire exact CSP/CORS
origins, recovery templates and HTTPS service URLs. Establish staging/production,
SMTP delivery, migrations/backups/restore/rollback, monitored failure handling,
rate limits/anti-abuse, moderation and load tests. Direct Supabase access also needs
an abuse-control strategy: limiting Worker traffic alone does not limit PostgREST.
Public name reservations, renaming/impersonation policy and profile moderation
need completion alongside community UI. Do not deploy this local configuration
as a production service. No production project, domain, credentials, billing,
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
- [Sign-out scopes](https://supabase.com/docs/guides/auth/signout).
- [Local database migrations](https://supabase.com/docs/guides/local-development/database-migrations).
- [Hono on Workers](https://hono.dev/docs/getting-started/cloudflare-workers).
- [Cloudflare rate-limit bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/):
  limits are per key and Cloudflare location; a binding alone is not a global quota.
