# Map packages and local library

Home's **Browse** opens the local collection. Import a `.notsumap` file, search by
song/artist/mapper/difficulty, filter favorites, select a difficulty, and play it
with the same audio-clock engine used by the editor. Normal play, No Fail,
Autoplay and in-session replay are available. Every local attempt is unranked.
Personal score persistence and online collection/ranking features remain pending.

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

## Remaining work

Online search/download/publishing, review/moderation, personal records, ratings,
ranked attempt tickets and persistent replays are not implemented here. Larger
real libraries need performance/storage-pressure testing. Production platform
support, human musical/readability tests and release signing remain open gates.
See [public-beta progress](public-beta.md) for verified evidence.
