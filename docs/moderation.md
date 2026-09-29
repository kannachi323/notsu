# Reports and community moderation

The local app supports private reports from player profiles and individual received
messages. Report drafts have navigation/unload guards, server-fetched evidence,
an optional block, and a private receipt. Your reports lists submission/review
status without exposing the reviewer, decision explanation or captured evidence.
Submitting a report does not automatically penalize the other player.

Authorized reviewers have separate Open/Reviewed queues, captured evidence,
reporter context, an explicit decision confirmation and recorded action history.
All user content is rendered as text. No attachment upload, remote image fetch or
client-supplied evidence is accepted. These features have been exercised against
local services and synthetic accounts; there is no public moderation operation yet.

## Evidence, access and requests

Every protected request uses the verified caller's JWT and publishable key. Database
functions also check the current verified Auth session. The Worker does not use a
service-role key for reporting or decisions. Actor IDs, roles, status, timestamps
and evidence cannot be supplied in a report body.

The server captures the current public profile or the exact message sent by the
reported player to the reporter. A recipient can report that known message after
blocking; this exception does not reopen history, authorize sending, or reveal
another person's messages. Self-reports and unavailable public profiles are refused.
Reported players cannot read reports about themselves or learn the reporter through
these endpoints. An explanation shown to a restricted player must not identify the
reporter or quote private messages; the review UI explicitly reminds staff of this.

Reports, quotas, staff membership, actions and restrictions are in the unexposed
`private` schema, with RLS and no client table grants. Only narrow RPCs are exposed.
Definer functions have empty search paths and qualified references. Do not add these
tables to Realtime: the sole publication remains `account_updates(user_id, revision)`.
Existing own-account hints trigger fresh authorized lookups; payloads contain no
report, reason, target, message or moderator details.

| API | Contract |
| --- | --- |
| `GET /v1/me/moderation/access` | Own current reviewer permission and own restriction explanation/expiry |
| `GET /v1/me/reports/context?target=UUID&message=UUID` | Server evidence preview; omit `message` for a profile |
| `PUT /v1/me/reports` | Exact `{ id, targetId, messageId, reason, details, block }`; private receipt |
| `GET /v1/me/reports` | Own receipts, 50 per page |
| `GET /v1/me/moderation/reports?status=open` | Reviewer queue; `reviewed` also supported |
| `GET /v1/me/moderation/reports/:id` | Authorized review detail and action history |
| `PUT /v1/me/moderation/reports/:id` | Exact `{ id, revision, action, note }`; confirmed review detail |

Lists use descending creation time/UUID and the existing `beforeTime`/`beforeId`
cursor, preserving PostgreSQL microseconds. The RPC reads 51 rows; the Worker
returns 50 and the last returned row as the next cursor. Queues are not frozen
snapshots: refresh to observe changes. Reports involving the reviewer's own account
are excluded from both lists and individual reads/decisions.

Report reasons are spam, harassment, inappropriate content, impersonation, suspected
cheating and other. Details require 1–2,000 Unicode code points / 8,000 UTF-8 bytes;
newlines/tabs are allowed, other control characters rejected. The JSON envelope is
limited to 16 KiB and five seconds. Decision notes require 1–500 code points / 2,000
bytes on one line; their JSON envelope is 4 KiB. Client requests have a ten-second
deadline and account-identity guards, without persistent report/token caches.

The database allows ten new reports per account per fixed 24-hour window anchored
at its first report. A request UUID and immutable-input fingerprint make identical
retries return the existing receipt without charging quota; changed input conflicts.
The UI retains this UUID for an unchanged draft after an uncertain response. An
optional block and report commit together; a full block list rolls both back and
the UI explains how to retry without blocking. Limits apply to direct RPC calls too.

## Staff decisions and restrictions

Reviewer authority is a row in `private.moderators`, checked on every read and
decision. No user-editable metadata or client JWT role claim can grant it. There
is no app endpoint to grant membership. A trusted database operator must provision
or revoke a verified staff account by its Auth UUID. Production staff enrollment,
MFA, access reviews and operator escalation are release prerequisites; the local
preview membership is not a production authorization decision.

Decisions require the report revision plus a distinct action UUID. Profile and
report locks serialize conflicting decisions; a stale revision returns a conflict.
An identical decision retry returns its result without creating another action.
Role revocation is serialized with decisions and checked against current membership.
Each report can record its initial action and, if applicable, one restriction lift.
Clients cannot alter audit rows. Trusted database operators retain administrative
access; this is not a tamper-proof external audit system.

| Action | Effect |
| --- | --- |
| Close without action | Close the report, recording the reason |
| Clear profile content | Replace username/name/bio only if all still match the captured profile |
| Restrict for 7 or 30 days | Hide public profile and deny community activity until server-clock expiry |
| Lift this restriction | Remove the still-active restriction created by this exact report |

Profile cleanup gives the player a unique generated handle, the display name
`Player` and an empty bio; it refuses to overwrite newer content. Account actions
against another moderator require operator review and are refused by the reviewer
RPC. An active restriction cannot be silently replaced or stacked by another report.

Restrictions apply at the shared profile-availability boundary: public reads,
profile writes, friend graph, messaging and visible presence. A trigger rechecks
direct profile writes after lock waits; presence renewal locks the profile before
checking permission and returns zero remaining visibility for a restricted player.
Existing leases expire immediately on a restriction. Auth, own profile reads,
blocking, reporting, account deletion and guest/offline gameplay remain available.
Restrictions do not delete friendships or conversations. Natural expiry restores
eligibility without needing the retention job; a fresh lease is still needed to
appear online. The Account screen shows the player's explanation and end time.
Future map publishing and ranked services must enforce this same community boundary.

## Retention and deletion

Hard account deletion still removes the original conversations, friendships,
profile and sessions. Existing report evidence and decision history deliberately
survive for private review. Identity foreign keys become null, but captured text,
names and the evidence's target UUID can remain; this is not anonymization. The
report form and account-deletion confirmation disclose this exception.

Migration `20260929000600_moderation.sql` enables `pg_cron` and schedules the named
`notsu-report-retention` job daily at 03:15 in the database cron time zone. The job
calls the service-only `private.purge_reports()` function:

- Unreviewed reports expire 180 days after submission.
- Reviewed reports expire 90 days after their most recent review, including a lift.
- Evidence and action history are deleted with the report.
- Restriction records expire from storage 90 days after their effect ends.

Daily scheduling can add up to a day to deletion, and outages can delay it further.
Before deployment, verify the cron time zone, privileges and successful executions;
monitor `cron.job_run_details` and alert on missed/failed runs. Local tests verify
the active job definition and invoke the real purge function on expired fixtures.
They do not prove unattended scheduler operation or backup deletion. Production
backup/log retention, restore behavior and public privacy disclosures remain gates.

## Verification and unfinished release work

TypeScript tests cover strict input/response mapping, private identity changes,
unknown-error sanitization, cursor precision and idempotent retries. Transactional
PostgreSQL tests cover private grants, report ownership, message evidence after
blocking, quotas, staff membership/revocation, conflicts, restrictions and natural
expiry, profile cleanup, tied-cursor paging, deletion and actual retention cleanup.

Real local Auth/Worker/PostgREST integration verifies concurrent report retries,
one winning review, direct-access denial, stale evidence, retained evidence after
account deletion and immediate role revocation. A deterministic row-lock barrier
proves that direct profile edits, profile-save RPCs and presence renewals already
waiting on the target cannot pass a newly committed restriction. Temporary accounts,
evidence, reviewer membership and Worker credentials are removed afterward.

The packaged macOS app was used to create a report, preserve an unfinished draft,
inspect its receipt, review captured evidence, confirm a restriction and inspect
the affected account notice. An authenticated API lift cleared that notice and
enabled profile editing without manual refresh. Only synthetic local accounts were
involved, and the preview restriction was lifted. Browser input automation timed
out before dispatch, so this slice does not claim an end-to-end browser UI pass.

Still required before public exposure: conduct rules, staff/MFA operations,
player appeals and operator escalation, monitored retention/backups, signup/read
abuse controls, external security review, long-queue/outage/load coverage and all
platform/browser checks. Suspected cheating reports are allegations, not proof of
human or automated input. Map and competitive-score moderation remain separate
unfinished parts of the accepted public-beta plan.

References reviewed September 29, 2026:

- [Supabase RLS](https://supabase.com/docs/guides/database/postgres/row-level-security):
  grants and row policies are necessary even when clients bypass the Worker.
- [Database functions](https://supabase.com/docs/guides/database/functions):
  restricted execution and fixed search paths for definer functions.
- [Supabase Cron](https://supabase.com/docs/guides/cron): job scheduling and run
  status tables for operational monitoring.
