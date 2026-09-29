# Online foundation

The full account/community release is still in progress. The account screen at
`/#/account` implements sign-up, email verification, sign-in, recovery, profile
editing and sign-out against real Supabase Auth and the Hono profile API. Services
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
network/refresh stress tests still need broader platform coverage. Account deletion,
public player-profile screens, profile moderation, optional persistent sessions,
and additional account controls remain unfinished.

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
never HTML. The profile UI renders them as text.

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
npm run test:email
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

`test:email` creates a disposable local account, reads only its captured Mailpit
messages, verifies and reuses an email code, refreshes the session, completes a
password reset and checks old/new password behavior. It removes its Auth identity
and captured messages. It refuses non-local service URLs and never delivers email
outside Mailpit.

For interactive API development, copy `.dev.vars.example` to `.dev.vars` and set
only the local publishable/anon key from `supabase status`, then run
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

Finish the remaining account controls and cross-platform flows; wire exact hosted
CSP/CORS origins, recovery templates and HTTPS service URLs. Establish staging/production,
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
