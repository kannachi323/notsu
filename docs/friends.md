# Friends and blocking

This is a working local community slice, not a deployed online service. The header
Friends control opens `/#/friends`. Verified players with a public profile can
send requests from another player's public profile, accept/decline incoming
requests, cancel sent requests, remove friends, block and unblock. Guest screens
link to sign-in while keeping local gameplay available.

Friendships are mutual: crossed requests remain pending until a recipient accepts.
The same logical pair has one relationship row. Lists are private to participants;
a block list is visible only to its owner. Blocking removes an accepted friendship
or pending request and prevents new requests in either direction. Unblocking does
not restore old relationships. Public profile names and bios remain public. The
other player receives a generic unavailable state, never the blocker’s block ID
or list. Banned/unverified/deleted targets cannot receive requests; no presence
status is inferred from friendship or from an existing Auth session.

The UI has Friends, Requests, Sent and Blocked views, explicit empty/error states,
confirmation for removing/blocking, and Refresh/Load more controls. It refreshes
on opening or explicit request; there is no live update subscription yet. Pending
network changes are not optimistically declared successful or automatically
retried after an uncertain response. Client results are scoped to the current
identity and list. None of this state or any bearer token is persisted locally.

## API and authorization

All endpoints run through the same verified, live-session middleware as account
controls. The Worker uses the caller’s JWT and a publishable key, never an admin
key for friends. JSON bodies share the bounded 4 KiB/five-second reader.

| Request | Result |
| --- | --- |
| `GET /v1/me/connections?list=friends` | First page; `incoming`, `outgoing`, `blocked` also accepted |
| `GET /v1/me/connections/:playerId` | Current caller’s relation to that UUID |
| `PUT /v1/me/connections/:playerId` | Apply a narrow action to that pair |

Actions are `send`, `accept`, `decline`, `cancel`, `remove`, `block`, `unblock`.
Existing-edge actions require `expectedId`; creating a request or block does not
accept one. Actor IDs, owner fields, timestamps and unknown body fields are
rejected. State-changing rules exist in PostgreSQL, not in the UI. The UI chooses
which controls to show but cannot grant permission.

A new relationship/block gets a new UUID. A delayed accept/cancel/remove/unblock
cannot affect a later generation. Retrying an action on the same generation is
idempotent where its postcondition still applies; accepting your own request,
using a stale generation, or declining an accepted friendship returns a conflict.
For an uncertain request, refresh to discover the actual state before retrying.

The migration creates `public.friendships`, `public.blocks` and a private per-user
request counter. RLS and SELECT grants limit direct reads. Clients have no direct
INSERT/UPDATE/DELETE rights; narrowly scoped security-definer RPCs validate the
JWT actor’s live session, actions, participants, generations and limits. Each
function has an empty fixed search path and fully qualified table references.
Private helpers are outside the exposed API schemas. The read-list RPC is a
security invoker and retains RLS. Do not expose the private schema through PostgREST.

Mutations lock the two profile rows in UUID order before checking or changing a
pair. All actions involving those players share the lock discipline, serializing
send/accept/block races and quota checks even before a relationship exists. Blocks
and request removal occur in one transaction. Account/profile deletion cascades
both sides of friendships and blocks, and Auth deletion removes the request counter.

## Bounds and pagination

Initial caps are 200 accepted friends, 50 outgoing pending requests, 200 incoming
pending requests, 1,000 blocked players and 30 new outgoing requests per fixed
one-hour window anchored at the first request. Existing-request retries do not
consume another slot. Request-rate limits never prevent blocking. These checks
also apply to direct RPCs; Worker-only limits could otherwise be bypassed.

Lists sort by relationship creation time descending, then generation UUID. The
RPC reads 51 rows; the API returns 50 plus an optional cursor `{ time, id }` using
the last returned row. Send both fields as `beforeTime` and `beforeId`; preserve
PostgreSQL’s microsecond timestamp precision. Pagination is not a frozen snapshot:
refresh to see newly arriving rows or changes made while paging.

These bounds are not the complete public abuse-control plan. Before deployment,
add monitored per-IP/user controls for reads and other mutations, bot/signup
controls, request-spam policy, reporting/moderation, and service-level load tests.
Live updates, presence and private messages must consult blocking on every access
and send, including races. Do not publish raw block-table deletion events: realtime
privacy must be designed and tested explicitly before enabling subscriptions.

## Verification

`npm run test:db` covers real PostgreSQL policies, transitions, revoked/banned
sessions, stale generations, cascade deletion, every capacity bound and timestamp
cursor ties. Test rows are transactionally rolled back; existing preview data is
preserved. `npm run test:online` includes actual workerd/Auth/PostgREST checks and
concurrent crossed-send, block/accept and block/send races. Disposable integration
accounts and Worker credentials are removed after each run. TypeScript tests cover
API input/mapping, private-session isolation, malformed responses and cursors.

Manual browser checks exercised send, accept, cancel, block/unblock, empty lists
and profile navigation against two local preview accounts. A browser request was
accepted in the packaged macOS app and then visible in both clients. These are
synthetic local identities; nothing was sent to an external person or hosted service.
Windows/Linux, full realtime behavior and public-release operations remain unverified.

References reviewed September 29, 2026:

- [PostgreSQL locks](https://www.postgresql.org/docs/17/explicit-locking.html):
  transaction-held row locks and consistent ordering for concurrent changes.
- [Supabase database functions](https://supabase.com/docs/guides/database/functions):
  invoker/definer privileges, restricted execution and fixed search paths.
- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security):
  direct API reads still need grants and row policies.
