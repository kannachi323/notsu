# Private messages and live updates

The local browser and desktop app support private text conversations between
accepted friends. Open Chat or a friend's Message link. The inbox shows accepted
friends, the latest text preview and unread counts (display capped at 99+). History
loads in pages of 50; earlier messages can be requested without loading the entire
conversation. Text is rendered as text, including markup-looking content; no HTML,
Markdown execution, link previews, file attachments or third-party media fetching.

Only accepted, verified, available friends can send or read a conversation.
Removing a friendship or blocking in either direction hides history and prevents
sending at the database boundary. Unblocking alone does not restore access; a new
accepted friendship makes the retained history available again. Previously delivered
content cannot be taken back from another person's device. Public profiles remain
public unless hidden by account availability or a community restriction. A received
message's Report link opens [private reporting](moderation.md). Its exact server
copy remains reportable after blocking, without restoring conversation access.

Deleting either account deletes both sides of its conversations, their read
positions and private message-rate records. Existing report evidence can survive
deletion for private review: 90 days after the latest review or 180 days after an
unreviewed submission, then scheduled removal. The account-deletion screen discloses
this exception. Production backup retention/deletion and restore behavior remain
release gates. Messages are access-controlled, not end-to-end encrypted; authorized
reviewers can inspect server-captured reported messages.

## Database and API

`direct_messages` is immutable to clients. Narrow RPCs get the actor from the live
JWT session, never a body field. Both participants must be available and mutually
accepted without a block. Sender/recipient IDs and content are checked by RLS on
direct reads as well as through the Worker. Guests have no message table access;
clients cannot insert/update/delete messages, forge read markers or publish update
signals directly. All definer functions use empty search paths and qualified tables.

Sending locks both participant profile rows in UUID order, exactly like friendship
and block transitions. A send racing a block either commits before the block or
is refused afterward. Once the block commits, history is unreadable. Per-pair
sequences order messages without revealing a global messaging counter. Sequence
values cross JSON boundaries as decimal strings, preserving PostgreSQL bigint
precision. No timestamp or sequence comes from the sending client.

Each send has a client-generated UUID scoped to its sender. The same ID/content/
recipient returns the existing receipt without spending quota; reusing an ID with
different content or recipient conflicts. The composer retains that ID for an
unchanged draft after an uncertain response. No automatic mutation retry declares
delivery successful. Drafts remain in memory with navigation/unload guards and
clear on confirmed delivery or an explicit discard. A page reload does not provide
draft recovery. No chat/token cache is persisted on disk by this feature.

Limits are 2,000 Unicode code points / 8,000 UTF-8 bytes, no blank-only or control
character bodies (newline/tab allowed), 30 new sends per fixed minute and 1,000 per
fixed day, anchored at the first send. Limits apply to direct RPCs. The message
endpoint accepts at most 16 KiB of JSON, including escape expansion, with the same
five-second stream deadline; other JSON endpoints retain their 4 KiB bound. Per-IP
and service-level abuse controls, retention/storage capacity and load tests remain
public-release gates.

| API | Behavior |
| --- | --- |
| `GET /v1/me/conversations` | 50 inbox entries and optional microsecond time/ID cursor |
| `GET /v1/me/messages/:playerId?before=sequence` | Latest/earlier 50 messages, descending sequence, optional next cursor |
| `PUT /v1/me/messages/:playerId` | Exact `{ id, body }`, immutable receipt |
| `PUT /v1/me/messages/:playerId/read` | Exact `{ sequence }`, monotonic own read position |

Read positions only advance to an existing message in the authorized pair and
never move backward. The app marks the latest loaded message read when the
conversation is visible and scrolled to its latest messages. Read receipts are
not shared with the other player. Idempotent read updates emit no notification,
preventing read/refetch loops. A disconnected history page is replaced if a gap
cannot be safely merged; the UI does not imply skipped messages are loaded.

## Realtime privacy and recovery

Only `public.account_updates(user_id, revision)` is in the `supabase_realtime`
publication. The publication permits INSERT/UPDATE only. Raw messages, friendships,
blocks, read positions and DELETE events are never replicated. SQL triggers update
each affected account's opaque revision; it conveys no peer, body, block reason,
message identifier or unread count. Read changes signal only their owner's devices.

Clients join private `account:<own UUID>` channels. Channel admission checks the
active session and own topic. Postgres Changes additionally applies the owner's
live-session RLS to every row; a banned/revoked account cannot keep receiving new
revisions solely because its websocket was admitted earlier. The hint is only an
invalidation: actual data is fetched through the authenticated API and checked
again. It never authorizes rendering a body supplied by another client.

The hook subscribes to INSERT and UPDATE, coalesces hints briefly, refetches after
joining/reconnecting and on focus, and removes subscriptions on navigation/account
changes. Chat, friends lists and profile connection controls share this mechanism.
It runs only on these screens, not during gameplay. Disconnection is labeled and
Refresh remains available. Message history is not periodically polled. Separate
[presence lookups](presence.md) update friend status on visible social screens;
they do not infer online activity from an Auth session or message timestamp.

The local stack now enables Supabase Realtime. The native local CSP overlay permits
only its exact loopback websocket path; the production CSP still needs real hosted
origins. Production channel configuration, publication discipline, private JWT
expiry/reconnect behavior, performance and rollback must be verified at deployment.

## Evidence and remaining work

Transactional pgTAP tests cover read/write grants, direct-data isolation, idempotency,
Unicode/control limits, paging, read positions, rate limits, blocking, revocation,
notification privacy and account deletion. Real workerd/Auth/PostgREST/Realtime
tests cover simultaneous retries, send/block races, refused foreign private topics,
owner-only payloads, ban enforcement on existing sockets and deletion without raw
delete events. Disposable accounts and subscriptions are cleaned up afterward.

Browser/macOS checks exchanged synthetic messages in both directions, exercised
unread state, guarded a draft, and observed a desktop block clear the browser's
open history and disable its composer. The preview friendship was restored through
a new request/acceptance. These messages are demonstration text, not playtester
feedback. A 60-message disposable browser fixture exercised earlier-page loading
and keyboard history scrolling, then was removed. Full reconnect/outage and
larger-history stress, external abuse review, moderation operations,
Windows/Linux and public operations remain unfinished. The subsequent
[presence slice](presence.md) adds opt-in friends-only online indicators, and
[reporting](moderation.md) adds private received-message reports and reviewer actions.

References reviewed September 29, 2026:

- [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes):
  publication setup, per-row authorization, scaling and DELETE limitations.
- [Realtime authorization](https://supabase.com/docs/guides/realtime/authorization):
  private topic admission and the difference between cached channel permissions
  and Postgres Changes RLS. Message content is fetched separately in this design.
