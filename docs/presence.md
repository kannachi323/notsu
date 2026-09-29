# Online visibility

Presence is opt-in and hidden by default. Account → Online visibility offers
Hidden and Friends only. Accepted friends can see an approximate Online/Offline
indicator in Friends, Chat and the profile connection controls. Hiding status
does not disable messaging. Guests and non-friends cannot observe it. Offline,
hidden, blocked, unavailable and missing players have the same lookup response;
network failures are labeled Status unavailable instead of inventing an answer.

The feature does not expose last-seen timestamps, device/session lists, window
counts, game activity or the map being played. Local preview identities are
synthetic. No hosted presence service has been deployed.

## Lifetime and privacy

Each signed-in app instance has a random client ID and strictly increasing update
sequence, scoped to its live Auth session. A visible, network-connected window
renews a server-clock lease every 30 seconds; each lease lasts at most 90 seconds.
Hidden/offline/page-exit events attempt an immediate release. Exiting or crashing
can prevent that request from finishing, so status may remain online until expiry.
No scheduled cleanup job is required for expiry to affect reads.

Separate clients/sessions have independent leases. Closing one does not take
another offline. Deleting/revoking an Auth session cascades its leases; banned,
unverified or deleted users fail the availability check. An Auth session alone
never means online. A newer release wins over an older delayed renewal, including
a release that arrives before the first renewal. Hiding is account-wide and
expires every client lease. Heartbeats cannot override the saved visibility.

The database returns remaining lifetime rounded down to five seconds, capped by
both lease and Auth session expiry. The client subtracts the full lookup round
trip and expires indicators against a monotonic clock. Friends views recheck
every 30 seconds while visible, on focus, and on private live invalidations.
There is no per-frame presence work. Social lookup timers/subscriptions unmount
when navigating into gameplay; the signed-in app's own heartbeat remains active.

Only the existing owner-only `account_updates(user_id, revision)` table is
replicated. Coming online, releasing the final lease, hiding and session removal
invalidate accepted, unblocked friends' own revisions. Routine renewals do not
fan out. Actual status is fetched with current friendship, block and live-session
authorization. A stale channel membership never grants access to a peer's status.
Lease/settings/quota tables remain in the unexposed private schema with no client
table grants. Account deletion cascades them. Production backup retention is
still a release gate; these records are not a last-seen product feature.

## API and bounds

| Request | Contract |
| --- | --- |
| `GET /v1/me/presence/settings` | Own confirmed `visibility`, defaults to `hidden` |
| `PUT /v1/me/presence/settings` | Exact `{ visibility: "hidden" \| "friends" }` |
| `PUT /v1/me/presence` | Exact `{ clientId, sequence, visible }`; returns own mode and `validForMs` |
| `GET /v1/me/presence?players=UUID,...` | 1–50 distinct players; returns only `userId`, `online`, `validForMs` |

Every route requires a verified live session. The Worker forwards the caller JWT
and public key; no privileged key or caller-selected actor/session/expiry is used.
JSON input shares the 4 KiB/five-second stream bound. Client requests time out
after eight seconds. Responses are uncached; client state remains in memory.

The database serializes changes on the actor profile and allows 60 online renewals
or visibility enables per fixed minute, and at most ten recent client records per
account. Existing releases and hiding remain possible after the renewal quota.
Closed records retain ordering tombstones for five minutes, then are reclaimed
on updates. Ten rapid reloads can temporarily exhaust the client cap; the UI
explains how to retry. Repeated identical preference writes do not notify friends.
Accumulated friend pages are fetched in batches of 50, up to the 200-friend cap.
Per-IP/read abuse controls and service capacity/load tests remain release work.

Settings display only confirmed state. A failed save retains the previous setting;
an older heartbeat response cannot overwrite a newer visibility operation.
Identity/generation guards discard stale responses across account changes. Text
labels accompany the static dots, controls expose their selected state, and
keyboard focus remains visible without animation.

## Verification and remaining work

- Domain, adapter, heartbeat and API tests exercise input/response bounds, exact
  peer membership, request latency/expiry, paged lookups, multiple instances,
  late responses, settings interleavings, account changes and safe error mapping.
- Real PostgreSQL tests cover private grants/publication, defaults, audience,
  blocking, sequence ordering, release-before-renew, multiple sessions, lease
  expiry, quotas, window bounds, tombstone reclamation and account/session deletion.
- Real local Auth/PostgREST/Worker/Realtime integration exercises independent
  Auth sessions, sign-out, expiry, hidden status, blocks/bans, delayed updates and
  exact opaque friend notifications, with an outsider negative control.
- Browser/macOS UI checks observe Online after desktop opt-in and Offline after
  hiding, without manual refresh. Friends, inbox, conversation and profile views
  were inspected. Hidden status leaves the existing conversation readable.
- At 720×600 the visibility panel scrolls into view without horizontal overflow,
  and keyboard focus moves between its two controls. No browser warning/error
  console entries appeared in the fresh verification session.
- Status remained online after desktop navigation into the Rhythm menu. After
  quitting the app, the browser's next lookup showed Offline and the database
  lease had expired. This was not a measured shutdown-latency benchmark.

The full release still requires Windows/Linux/browser-matrix checks, suspend/wake
and reconnect stress, real network-delay/load tests, hosted configuration and
operations. This local functional evidence is not a latency or performance claim.

References reviewed September 29, 2026:

- [Supabase Presence](https://supabase.com/docs/guides/realtime/presence) describes
  channel state and client-tracked payloads. This implementation uses database
  leases and authenticated lookups instead of broadcasting client presence data.
- [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization)
  distinguishes cached channel permissions from row authorization. The existing
  private hint channel and freshly authorized lookups preserve current access.
