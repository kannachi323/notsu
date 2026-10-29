# Map packages and local library

Home's **Play** opens song selection; **Browse maps** presents the same local
collection as an artwork grid. Search by song/artist/mapper/difficulty, filter
favorites, sort the collection, preview the recording, select a difficulty, and
play it with the same audio-clock engine used by the editor. Normal play, No Fail,
Autoplay and persistent local replays are available. Every local attempt is
unranked. Online collection and ranking features remain pending.

Three [starter packs](starter-maps.md) ship with the app, each containing its own
music and two difficulties. No separate recording or account is needed. Importing
a `.notsumap` likewise supplies the full recording and charts; importing an MP3/WAV
on its own is an editor action, not a requirement to play someone else's map.
The included packs remain available when local storage fails. Favoriting one saves
its pack and preference locally. Bundled entries cannot be removed from the app;
imported revisions retain the existing removal/undo flow.

## Portable format

A version 1 package is a ZIP archive containing exactly:

- `map.json`: `format: "notsu-map"`, `version: 1`, stable set `id`, title, artist,
  author, song reference, and a difficulty list. Each difficulty has a stable
  chart `id`, name, author and `path` such as `charts/1.json`.
- `audio.mp3` or `audio.wav`: the original recording. The song reference includes
  SHA-256, original filename, MIME type, byte size and measured duration.
- `charts/1.json` through `charts/16.json`: validated Chart v2 documents. Each
  chart must reference the packaged recording hash and fit inside its duration.

Difficulty IDs and names must be unique within the set. A package may retain empty
draft difficulties; the browser labels these Draft and disables play until circles
exist. The editor restores the entire set atomically and rejects collisions with
existing draft IDs without overwriting work. Timestamps, shared hits, holds,
tempo sections and motion survive the round trip.

Limits: 128 MB archive/expanded total, 18 files, 64 KB manifest, 4 MB per chart,
100 MB original recording, and 16 difficulties. ZIP processing runs in a worker
with a 30-second deadline. The shared ZIP reader checks matching central/local
headers, safe relative paths, uniqueness, overlap, supported compression, actual
inflated byte counts and CRC. Map import also rejects unreferenced files and
verifies the recording's SHA-256. Media is decoded locally before gameplay or
editor use, with the same duration/channel/memory checks as direct song imports.
Nothing is extracted to a filesystem; packages cannot execute code or set rules.

The canonical map-set representation keeps only known fields, explicitly
normalizes chart fields and default easing, and sorts difficulties by ID. Its
SHA-256 is the revision identifier. Compression and ZIP timestamps do not affect
identity. Content changes create a different revision. These identifiers are local
content identities, not evidence that a map has passed online ranking review.

## Storage and exports

The `notsu-maps` IndexedDB database stores package Blobs and lightweight summaries.
Limits are 200 revisions and 1 GB of archives. Re-importing identical content
preserves import date and favorites, while replacing archive bytes to allow repair.
Changed content retains earlier revisions; the selection panel exposes each one.
All mutations are transactional and success is reported only after commit.
Storage failure leaves a successfully parsed import playable for the current
session with a visible warning. Keep the source file for recovery.

**Remove this revision** affects only the local library and offers in-session
**Undo removal**. It does not delete editor drafts or the exported source file.
Undo keeps one removed package in memory; it is not a persistent trash system.
Browser data clearing can remove the entire local collection, so exported files
are the portable backup.

Exports use a direct browser download link or the narrowly scoped native
`save_map_pack` command. The desktop host owns the Save dialog, enforces size and
filename bounds, and atomically replaces the chosen file. No frontend command
accepts an arbitrary destination path. Map and skin saves share this implementation
but have separate size limits and extensions.

## Local records and replays

Finished song-selection attempts save their result and replay in the separate
`notsu-records` IndexedDB database. **Personal best** uses completed Standard runs
without No Fail, Autoplay, frozen lines or resume assistance. Compare score first,
then maximum combo, then accuracy. Exact ties share performance; the earliest
saved replay represents a tied best. Revisions, difficulties and rules versions
remain separate. A short map may be completed with misses and still set a low or
zero first best under the current health rules.

**Recent attempts** includes assisted and failed runs with explicit labels.
**Watch replay** loads the exact selected map revision and original song, checks
the replay, and opens playback through the real engine. The saved result and its
input stream are recomputed in a worker before saving and before replay loading.
Playback creates no new attempt; **Watch again** repeats playback rather than
silently switching to live input. Bundled map attempts enter this history as well;
editor playtests and legacy internal studies do not.

Results show saving, success, personal-best improvement/tie, or failure with a
retry action. Writes use a stable attempt ID and one transaction for result/replay
storage, so retries cannot create duplicates. Saving can finish after returning
to Browse; the collection refreshes on commit. Wait for success before closing
the app. A storage failure does not invalidate the in-session score or replay.

Storage keeps up to 1,000 attempts and 128 MB of replay data, with 32 MB per replay
and the existing 250,000-input replay bound. It never evicts old records silently.
**Remove attempt** offers Undo while this view remains open, until another removal.
Undo keeps the original replay Blob even if it was damaged; it is not persistent
Trash. Removing a best recomputes the best from remaining Standard attempts.
Removing a map package leaves its records intact; reimport the same revision to
access them. These are device-local records, with no account sync or online rating.

## Online discovery and publication (October 4 source implementation)

`/#/browse?source=online` opens the public catalog, with bounded search and cursor
pagination. Downloads stream at most 16 MB, check the archive SHA-256 and exact
logical map revision, then validate in a worker before local import. Online packs
use a 256 KB per-chart bound. No account token is sent for public catalog/media
reads. Unconfigured or malformed online configuration leaves local play available.

`/#/publish?map=<revision>` selects a local pack. Verified email/password accounts
with a public profile can publish after explicitly confirming distribution rights
for the map, music and every included asset. Publishing shares the complete pack
publicly as an **unranked community map**. The same account/revision keeps its
upload ID across retries. The server validates the actual archive, rechecks the
live session at completion, and never trusts client metadata or rank claims.
Publishing an existing revision preserves its withdrawal/moderation state.

Your publications can be refreshed, withdrawn or restored. Visibility changes
send the last known version; stale conflicting actions return `map_changed`/409.
Withdrawing stops new catalog reads and downloads. Previously downloaded copies
remain playable. Staff moderation cannot be bypassed by republishing or restoring.
There is currently a narrow staff API, but map-review screens and map reports
remain release work.

Apply `20261004000900_map_media_retention.sql` before running the updated Worker.
New reservations allocate a server-generated media generation that survives
active retries and changes after expiry, even if a client reuses its upload ID.
Published media is immutable. Older published objects remain readable through
the legacy path. The Worker entry is `server/worker.ts`, with Hono routes still
composed in `server/app.ts`. An hourly Cloudflare trigger scans up to 500 objects
per invocation, retaining its inventory cursor in PostgreSQL. Objects older than
two days are deleted only after a successful reference check. Withdrawn and
moderated packs retain their bytes; deleted-account and abandoned-upload objects
are eventually removed. Failed checks/deletes do not advance the cursor.
References: [R2 Worker API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/)
and [scheduled handlers](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/).
These are deployment configuration changes, not a deployed service or automation.

If IndexedDB fails, validated imports remain available across route changes in
the current app session, with a visible warning. This temporary cache caps at 20
revisions/256 MB of archives and clears when the app closes or reloads. Export
packages before leaving the session; temporary favorites are not saved to disk.

Added source coverage for exact-download integrity, streaming limits, public reads,
lost-response retries, account changes, catalog cursors, stale visibility conflicts,
retention failure behavior and storage-generation lifecycle. No tests, builds,
migrations or browser/native smoke checks were run on October 4. The previous
integration checkpoint reported HTTP 500 on a stale visibility request; its saved
Worker log shows a proxy **Network connection lost** error. The 409 error mapping
has regression coverage in source, but the original live integration must still
be rerun; source inspection does not establish its cause or resolution.

## Remaining work

Online deployment/integration verification, map-review/reporting UI, ratings,
ranked attempt tickets, cloud replay storage and account sync remain incomplete. Larger
real libraries need performance/storage-pressure testing and a device-wide record
manager for unavailable maps and damaged entries. Record portability/backup also
remains open; browser data clearing removes local results and replays. Production platform
support, human musical/readability tests and release signing remain open gates.
See [public-beta progress](public-beta.md) for verified evidence.
