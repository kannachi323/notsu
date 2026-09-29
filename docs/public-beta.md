# Public-beta delivery contract

Accepted September 29, 2026. This document tracks the whole release; a completed
local slice is not evidence that the public beta is ready.

## Platforms and architecture

- Windows x64, macOS Apple Silicon/Intel, Linux x64, and desktop browsers.
- The Cloudflare Pages frontend is the actual browser game, not a separate site.
- Tauri 2, React, TypeScript, Vite; custom Canvas2D gameplay/editor and Web Audio.
- Pure TypeScript rules shared by gameplay, editor preview and replay verification.
- Hono/TypeScript on Cloudflare Workers; Supabase Auth/PostgreSQL/Realtime;
  Cloudflare R2 for map assets and private replays. Minimal native Rust only.
- Feature-first organization remains. Preserve Trivia placeholders and historical
  design notes. No .NET/game-framework dependency or copied third-party branding.

## Gameplay contract

Independent straight lanes translate, rotate, and change length on authored
musical timing. Polygons/crossings/radial patterns are lane arrangements, not
paths transferring notes at intersections. Taps and holds are the only note types.
Any ordinary gameplay key is interchangeable. A logical note can appear on several
lanes: one press judges the shared hit once. Shared holds have identical start/end
times. Each hold owns its physical key, while other keys can play independent notes.

Chart v2 adds lanes, visual instances and tempo sections while retaining v1 timing
through migration. Clock timestamps determine judgements, never collisions or FPS.

Initial rules (version all changes before ranked publication):

| Grade | Absolute error | Accuracy weight | Health change |
| --- | --- | --- | --- |
| Perfect | <=45 ms | 1 | +2% |
| Good | <=90 ms | 0.7 | +1% |
| Okay | <=140 ms | 0.3 | 0 |
| Miss | Outside window | 0 | -12% |

Health starts at 100%, clamps to 0–100%, and zero ends normal attempts. Hold heads
and tails are separate judgements; an unpressed hold misses both once. Extra
presses reset combo, lower accuracy and cost 4% health. Early broken holds cannot
be rescued. Key repeat and typing in interface controls never score.

Score = round(1,000,000 * (0.70 * C + 0.30 * A)). C is accumulated sqrt(current
combo) on successes divided by the uninterrupted maximum. Completed-run A is
weighted earned judgements / (expected judgements + extras). The HUD may show
running accuracy against judgements resolved so far; unfinished notes never award
score. Ties use max combo, then accuracy; exact ties share placement.

No Fail and Autoplay are the first mods and never enter rankings. Resumed attempts
and frozen-choreography assistance are practice-only. Reduced-motion effects alone
do not change gameplay. Pause/resume must stop time and use a count-in.

## Complete experience

- Approved cyan/violet orb/ring art, production atlas bounds/anchors/animations,
  original sound feedback, readable accessible UI, tutorial, results, retry/replay.
- Versioned skin packs: notes, targets, lines, effects, sound and colors; built-in
  fallbacks; no scripts, timing changes, geometry changes, or interface replacement.
- Settings: music/hit/interface volumes, calibration, appearance, display,
  accessibility and account controls.
- Manual editor: MP3/WAV baseline, waveform, metronome, tempo changes, beat/tuplet
  snapping, taps/holds/shared hits, geometric presets and lane/group keyframes,
  live engine preview, undo/redo, autosave/recovery, import/export and validation.
- Local/online library: search, filters, favorites, downloads, difficulties,
  personal records, full distributable media packages and immutable revisions.
- Verified email/password accounts, usernames, recovery/deletion, profiles,
  friendships, presence, private messages, blocking/reporting and moderation.
- Proper grants/RLS and private realtime subscriptions. Privileged keys remain
  server-side; no production secrets in frontend assets or desktop binaries.
- Authenticated attempt tickets bind map revision/rules/mods; idempotent replay
  submission is recalculated server-side. Replays do not prove human input.
- Reviewed ranked maps receive difficulty 1–10. Play rating is
  100 * difficulty^2 * (score/1,000,000)^4. Overall rating uses the best 50 distinct
  map-set results weighted by 0.95^i, with only one result per map set.
- Guest/offline local play remains available; offline-only attempts are unranked.

## Milestones and evidence

| Milestone | Required exit evidence | Current state |
| --- | --- | --- |
| Shared core | Multi-lane play, holds/shared hits, score/health/mods, deterministic replays and tests | In progress |
| Presentation | Production assets/skins/sounds, tutorial, settings and results, visual/audio review | In progress |
| Creator workflow | Import song -> author -> save/reopen -> export -> play without code | In progress |
| Community | Deployed accounts/maps/friends/messages/moderation, authorization checks | In progress: local accounts, profiles, friends and blocking |
| Public beta | Verified rankings, reviewed starter maps, platform releases and operational gates | Pending |

Required validation: timing boundaries, FPS/input/replay equivalence, overlapping
holds, score/failure/mod eligibility, editor round trips/recovery, corrupt import
and skin fallback, access-control isolation, upload/submission limits, blocked
messaging, browser storage failures, real audio/input checks across supported
platforms and browsers, and external musical/readability playtests.

Performance target: sustained 60 FPS at 1080p on documented reference machines.
Capacity target: about 1,000 accounts and 100 concurrent online users. Include
staging/production, migrations, backups, rollback, errors/usage monitoring, rate
limits, signing/installers and an introductory-to-advanced reviewed starter set.
Paid service tiers require a concrete estimate; no spending ceiling was supplied.
Credentials, signing access, distributable media and human playtests must be real.

### September 29 implementation evidence

Implemented the first shared-core slice: validated Chart v2 and v1 migration,
tempo-aware beat conversion/snapping, independent interpolated lanes and shared
visual notes, overlapping key-owned holds, combo-weighted score, health/failure,
No Fail/Autoplay, canonical map fingerprints, replay recording/playback and pure
recomputation. The new four-line geometry study is available from Play. The
approved sprite reference is preserved in the repository for the presentation
milestone; current gameplay still uses Canvas-drawn art.

- `npm ci`: restored locked dependencies; npm audit reported no vulnerabilities.
- `npm test`: 126 passing tests in 13 files. Coverage includes timing boundaries,
  shared hits, overlapping holds, replay equality at 10/30/60/144 FPS, invalid
  replay rejection, score/health/mod rules, delayed timestamp reconciliation,
  and closing the inclusive final hit window at chart completion.
- `npm run build`: TypeScript checking and production web bundle passed.
- In-app browser: completed **Moving together** with Autoplay and then watched
  its replay. Both produced 1,000,000 points, 100% accuracy and 48 Perfect
  judgments. Standard **Timing study** correctly failed after nine missed
  judgments. No warning/error console entries during those flows.
- Browser evidence: ignored `.tools/screenshots/geometry-replay-results.png`.

### September 29 pause and assistance follow-up

Implemented three-second resume from the saved musical position, re-grabbing
active physical hold keys, cancelling resume when a required hold is released,
and releasing non-hold keys to recover from lost keyups. Calibration and score
survive resume; Retry resets resumed status. Audio-start cancellation now prevents
old asynchronous starts from interfering with a new attempt.

Added the separate **Freeze line movement** setting, keeping each lane's opening
geometry and matching feedback anchors. Reduced effects continue to preserve
authored motion. Replay v2 records assistance flags, and pure eligibility excludes
both resumed and frozen-line attempts.

- `npm test`: 141 passing tests in 15 files, including overlapping hold recovery,
  count-in boundaries, assistance/replay round trips, frozen geometry, saved
  preference migration, calibrated offsets and cancellation/concurrent starts.
- `npm run build`: TypeScript and production web build passed.
- Browser: verified pause/resume at the saved position, resumed-practice labeling,
  a real keypress into a shared hold followed by pause, the re-grab prompt, and
  cancellation when the re-grabbed key was released during count-in.
- Browser: a No Fail, frozen-line, resumed geometry run completed with all 48
  misses accounted for; its replay reproduced the same result. No warning/error
  console entries occurred during this verification run (earlier development
  hot-reload errors were cleared by reloading before verification).
  The result identified every practice condition. Screenshots
  are in ignored `.tools/screenshots/hold-resume.png` and
  `.tools/screenshots/resumed-practice-results.png`.

Real input/audio and complete held-key resume on physical keyboards still need
platform validation. Browser automation above is functional evidence, not musical
playtesting or a hardware latency/performance measurement. Native builds and all
online services remain unverified/unimplemented. No public release has been deployed.

### September 29 runtime artwork follow-up

Generated a separate twelve-sprite cyan/violet atlas with the built-in imagegen
tool and saved its prompt, original PNG and measured frame/pivot metadata in
`src/features/rhythm/assets/`. Midnight now draws atlas notes, targets, warnings,
lines, ribbons and expanding hit rings. High Contrast keeps its primitive art.
Image decode/dimension failure uses the existing drawing fallback. Sprite pivots
align with logical note positions, and cap proportions survive line stretching.

- `npm test`: 148 passing tests across 17 files, including PNG/metadata dimensions,
  frame/pivot bounds, concurrent loading, invalid art fallback and cap geometry.
- `npm run build`: production bundle and type checking passed.
- Browser: inspected real shared holds, release endpoints, target highlighting and
  moving geometry on the dark stage. Autoplay still completed with 1,000,000
  points and 48 Perfect judgments, with no console warnings/errors during the run.
  Evidence is in ignored
  `.tools/screenshots/atlas-geometry.png`.

This starts the presentation milestone. User-imported texture/sound/theme skin
packs, calibration workflow, broader sound/UI polish and cross-platform asset
review remain required; this atlas does not complete that milestone.

Mobile, automatic mapping, extra note types, public chat, multiplayer and arbitrary
HUD/interface skinning are out of scope. No release gate may be silently dropped.

## Research baseline

Read the upstream implementations without introducing their dependencies:

- ppy/osu at `1a84c00929fa70b23a20e8109af1289f34b50af2`: hit windows,
  ScoreProcessor, EditorClock, skin fallback, beatmap management and difficulty.
- ppy/osu-framework at `2b3ffd60d1baa4fed7f87d8211cda736f95e35fb`:
  InterpolatingFramedClock.
- Official Supabase auth/RLS/realtime docs, Hono Workers docs, Cloudflare
  Workers/R2/Pages docs, Tauri webview/distribution docs and Web Audio references.

Upstream timing/difficulty rules differ by mode. The scoring/rating formulas above
are original notsu starting specifications, not claims of compatibility or a
validated universal skill measurement.

### September 29 imported skin packs follow-up

Implemented versioned local `.notsuskin` ZIP imports with strict appearance-only
manifests, measured PNG frame bounds, PCM WAV decoding, theme contrast checks,
per-asset fallbacks and bounded worker processing. Added preview controls,
IndexedDB persistence, duplicate-pack handling, removal/Undo, session-only use on
storage failure, and original starter-pack/export archive generation. Custom
sprites and preloaded sounds now feed the same gameplay renderer/feedback path;
skin data cannot change timing or scoring. See [skin format](skins.md).

- `npm test`: 208 passing tests in 25 files. New coverage includes traversal and
  unsupported fields, compressed size lies, CRC failures, archive budgets, frame
  geometry, invalid/empty PNGs, PCM normalization, blocked/quota-failed storage,
  corrupted saved packs, catalog limits, worker timeout/cleanup, and mixed
  custom/synthesized audio voices. The complete starter pack round-trips with all
  twelve sprites and both hit sounds.
- `npm run build`: type checking and production frontend/worker bundles passed.
- In-app browser: imported an actual PNG/WAV pack, restored it after reload,
  removed/restored it using Undo, rejected a timing-rule injection while retaining
  the selection, and showed independent missing-image/malformed-WAV fallbacks.
  The sound preview controls ran without console errors; listening quality still
  requires human review.
- In-app browser: the imported pack completed **Moving together** Autoplay with
  1,000,000 points and 48 Perfect judgments; no warning/error console entries
  occurred during this verification window. Screenshots are in ignored
  `.tools/screenshots/skin-settings.png` and `skin-gameplay-results.png`.

Initial verification: starter/export controls reached the download-request state,
but the in-app browser did not report a saved download. No downloaded-file result
is claimed. Archive creation is tested; browser download handling, native save
integration, actual platform WebView asset/audio behavior and broader skin
readability/listening review still need completion. Presentation remains in
progress. Editor/library, online community, competitive backend and public release
are still pending; the long-term goal remains active.

### September 29 native and browser export follow-up

Implemented a bounded native Save command using a Rust-owned dialog and atomic
replacement. Cancellation preserves the selected skin; failed writes clean up
staging files. Browser exports use persistent download links with Blob URL cleanup.

- Packaged macOS debug app: saved a starter pack, re-imported it, cancelled export,
  and saved a second export. The saved/re-exported archives were byte-identical.
  The imported pack completed Moving together Autoplay with 1,000,000 points,
  100% accuracy and 48 Perfect judgments.
- Zen (Firefox-based browser): the real Download starter control saved a 703,816
  byte archive. Its four unpacked files matched the native starter assets exactly.
  The in-app browser's download event remains unavailable; no result is inferred
  from that event alone.
- Native UI evidence: ignored `.tools/screenshots/native-skin-export.png`.
  Frontend save/cancel/error/bounds and capability tests pass. Native tests cover
  name/size validation, exact replacement and failure cleanup.

This closes the earlier local save gap. Cross-platform native validation, signing,
human sound/readability testing and the remaining presentation work are still open.

### September 29 first local editor workflow

Connected Home's Editor links to a real local authoring screen. Implemented
MP3/WAV import with hashed recording identity, waveform and tempo grid, taps and
holds shared across selected lines, per-line/group movement keyframes, four
geometry presets, metadata, bounded undo/redo, transactional song/draft storage,
serialized autosave with stale-writer rejection, reload recovery, chart-only JSON
backup/restore, and actual-engine No Fail/Autoplay playtests. See [editor](editor.md).

- `npm test`: 238 passing tests across 29 files; native export has four passing
  Rust tests. Editor tests cover musical/domain invariants, saved song identity,
  metadata bounds/timeouts, restored excerpt bounds against decoded media,
  stereo waveform peaks, storage failures, revision
  conflicts, recovery and coalesced autosaves.
- `npm run build`: type checking and the production frontend passed.
- `npm run tauri -- build --debug --bundles app`: packaged macOS debug build passed.
- Browser: imported an original 16-second WAV, authored a rotating three-line
  group with five shared taps and a shared hold, verified Undo/Redo, and completed
  Playtest with 1,000,000 points, 100% accuracy and seven Perfect judgments. Added
  a 180 BPM change without moving existing notes. Reload/reopen produced the exact
  same complete draft JSON. Restoring that backup with the original recording
  created a second playable draft. MP3 import and waveform/listen startup also passed.
- Packaged macOS app: created a WAV draft, restored the browser-authored chart from
  its exact backup text and original song, edited line selection/geometry, and
  completed native Autoplay with the same 1,000,000 points and seven Perfect
  judgments. This is functional evidence, not a human audio-latency measurement.
- No new browser warning/error logs appeared during the verification flows; an
  earlier Vite reload error from intermediate missing files predates those checks.
  Evidence: ignored `.tools/screenshots/editor-native.png`,
  `editor-playtest-results.png` and `editor-native-results.png`.

The editor milestone is not complete. Full distributable song/map packages,
native package Save, metronome, stronger selection/retiming and recovery tools,
library/map sets, publishing and mapper/performance/cross-platform tests remain.
All community, competitive backend and public-release gates remain active.
### September 29 portable maps and local browser

Implemented complete `.notsumap` packages with the original MP3/WAV recording,
up to sixteen difficulties, canonical revision hashes and bounded worker import.
Map and skin archives share checked ZIP handling. The editor creates related
difficulties, exports one or all saved difficulties, adds packages directly to
Browse, and imports complete packages into transactional drafts. Native map Save
shares the atomic dialog-owned exporter with skins, using a separate capability
and 128 MB bound.

Home's Browse links now open a functional local collection with search, favorites,
sorting, difficulty selection, preserved revisions, export and removal/Undo.
Imported songs play through the existing engine with Standard, No Fail, Autoplay
and in-session replay. These attempts are explicitly local and unranked.

- `npm test`: 252 passing tests in 33 files. New checks cover multi-difficulty
  recording/chart round trips, editor identity preservation, canonical hashes,
  altered/missing audio, path/reference/size rejection, worker timeout, storage
  rollback, duplicate revisions, favorites, removal/Undo, damaged archive repair
  and atomic multi-difficulty draft imports.
- Five Rust export tests pass; frontend type checking/production build and the
  packaged macOS debug app build pass.
- Browser: authored a second difficulty, packaged both with the recording, added
  them to Browse, tested search, favorite/reload recovery, revision selection,
  removal/Undo, and rejection of a corrupted package without losing selection.
- macOS debug app: saved a 1,414,457-byte complete package. Its original WAV
  matched the manifest hash. Imported that actual saved file into both the browser
  library and browser editor; all six logical notes, three lanes and the waveform
  returned. Two revised metadata versions remained independently selectable.
- Browser and native library Autoplay both completed with 1,000,000 points,
  100% accuracy and seven Perfect judgments. Browser replay reproduced the result.
- Zen's real browser Download control produced a byte-identical package in
  Downloads. The temporary test tab was closed afterward.
- A development hot-reload router-blocker warning occurred at 11:02 UTC. A clean
  reload and editor/home/browser navigation produced no additional warnings or
  errors. Screenshot evidence is in ignored
  `.tools/screenshots/map-browser-native.png` and `map-browser.png`.

See [map package and library details](maps.md). The creator milestone still needs
advanced editing, metronome, richer recovery/draft management and mapper testing.
Personal records, online maps/community/rankings, deployment, performance and
cross-platform release gates remain unfinished. The full goal stays active.

### September 29 selection, rhythmic phrases and movement easing

Added single/multiple circle selection, inclusive time-range selection, exact
tap/hold inspection, batch beat/millisecond retiming, local-grid snapping, shared
line reassignment, deletion and an in-editor rhythmic phrase clipboard. Pasting
keeps beat offsets across destination tempo changes with fresh logical identities.
Timeline heads and hold endpoints can be dragged with a visual preview and one
history entry. Pointer cancellation/Escape abandons a drag. Invalid batches fail
without partially modifying notes or merging scored objects.

Arrival easing is exposed for individual/group/preset movement. Existing easing
is preserved by default; an explicit easing edit changes only that property on
existing destination frames, with no pose replacement. See [editor guide](editor.md).

- `npm test`: 273 passing tests across 34 files. New cases cover tempo-crossing
  phrase moves/paste, shared instances, exact endpoints, tap/hold conversion,
  duplicate identities, bounds, orphan lines, collisions, collapsed holds,
  atomic undo/redo and destination easing without geometry changes.
- Frontend type checking/production build and the packaged macOS debug build pass.
  Native code is unchanged in this slice.
- Browser: moved two selected circles together, rejected their next colliding move
  unchanged, undid the move, copied the phrase into a faster section, edited an
  exact hold endpoint, and changed destination easing. Selected three circles by
  time range, deleted them as one operation, and restored all three with Undo.
  Reload/reopen preserved all eight circles, the edited hold endpoint and linear
  arrival easing. The clean browser session reported no warning/error logs.
- macOS debug app: dragged a shared tap from 1,000 to 1,500 ms and a hold endpoint
  from 10,000 to 10,500 ms. The hold start stayed at 8,000 ms across all three line
  instances. The edited chart completed actual-engine Autoplay with 1,000,000
  points, 100% accuracy and seven Perfect judgments. Both edits were then undone
  and the original test fixture saved. Pointer coordinate checks used the native
  app; the in-app browser's scaled pointer test did not verify dragging.
- Screenshot evidence: ignored `.tools/screenshots/editor-selection-native.png`.

Metronome/count-in, richer draft/recovery management, large-map performance and
mapper/platform testing remain open in the creator milestone. This progress does
not complete the community, competitive backend or public-release requirements.

### September 29 editor metronome and count-in

Implemented original synthesized metronome clicks, two/four-beat audible count-in,
independent song/click volumes and live metronome toggling. Quarter-note clicks
follow local tempo anchors; count-in uses the chosen cursor's tempo and freezes
the playhead until music begins. The song and clicks share the existing audio
clock, with scheduling independent of React frames and output-latency display
compensation. Pending starts and queued voices cancel on pause, seek, edits,
hidden-page events and disposal. Delayed callbacks skip overdue clicks, and bounded
scheduling reports excessive tempo density instead of allocating unbounded voices.

Fixed a browser-observed end-of-song issue: pause now captures the actual audio
clock even between UI updates, the playhead reaches the exact duration, Listen
restarts from zero, and the timeline keeps the last populated page at the end.

- `npm test`: 291 passing tests across 36 files. New coverage includes section
  boundaries, off-grid cursors, fractional tempos, count-in at 1–1,000 BPM,
  output latency versus scheduling time, original sample bounds, delayed callbacks,
  live configuration during asynchronous resume, cancellation/concurrent starts,
  suspension, pending voice cleanup and excessive-density failure.
- Type checking, production frontend and packaged macOS debug builds pass.
- Browser: verified four-beat count-in, cancellation at an unchanged 8,000 ms
  cursor, live song/click volume changes and metronome toggling, automatic stop at
  exactly 16,000 ms, and restart from zero with two-beat count-in. Settings did not
  modify the draft. A development hot-reload hook-order error occurred at 11:40 UTC
  while hooks were being added; a fresh reload and the subsequent checks produced
  no additional errors.
- Packaged macOS app: verified four-beat count-in with the playhead fixed at zero,
  cancellation by focusing a line-editing control, and playback from 15,000 ms
  through count-in to an exact stopped 16,000 ms. The saved fixture was unchanged.
- Screenshot evidence: ignored `.tools/screenshots/editor-metronome-native.png`
  and `editor-metronome.png`.

These are software scheduling and functional checks, not physical latency
measurements or human listening approval. Richer draft/recovery management,
large-map performance, mapper playtests, additional platform checks, online
community/rankings, deployment and release gates remain open. The goal stays active.

### September 29 draft management and recovery

Added searchable/sortable draft collections, recoverable Trash, explicit permanent
removal, transient save retries and a recovery-copy action for conflicting or
session-only edits. Recovery copies receive independent map-set/chart identities
and retain the complete authored chart and original recording. Related difficulty
copies propose unused names and check the sixteen-difficulty limit.

Draft storage version 2 preserves the previous database and adds Trash. Revision
plus lifetime-token checks reject stale writes after another window saves, trashes,
restores or re-imports a draft. Trash counts toward the fifty-draft limit. Permanent
removal and song collection are atomic, retain audio used by active/trashed siblings,
and conservatively preserve songs when damaged records have unknown references.

- `npm test`: 303 passing tests across 38 files. New cases cover version-one
  migration, exact chart/recording recovery, stale actions/confirmations, lifetime
  reuse, shared audio collection, rollback during song deletion, capacity accounting,
  recovery-copy isolation, unique copy names, transient retries, concurrent retry
  calls and retaining the latest edits after repeated failure.
- Type checking, production frontend and packaged macOS debug builds pass.
  Native Rust behavior is unchanged.
- Browser: created a separate test difficulty, opened it in two windows, saved
  divergent titles, observed the stale-save recovery panel, and saved a recovery
  copy. Both versions remained independently visible with eight circles each.
  Search, Trash, reload, cancel-permanent-removal and restore worked. Reopening the
  restored copy recovered all eight circles, three shared lines, the edited hold
  endpoint and original recording/waveform. The dedicated verification tab
  reported no warning/error logs. Permanent removal was verified in adapter tests;
  the real-data UI check stopped at its cancellation control.
- Packaged macOS app: existing drafts survived migration. Duplicated the authored
  six-circle/three-line fixture, moved the duplicate to Trash, restored it and
  reopened it with its original hold endpoint and recording/waveform intact.
- Screenshot evidence: ignored `.tools/screenshots/editor-draft-recovery.png`,
  `editor-recovery-conflict.png` and `editor-draft-recovery-native.png`.

Damaged-record salvage, large-map performance, mapper/platform playtests and the
remaining presentation work are still open. Recovery preserves competing versions;
there is no automatic merge. All online community, competitive backend, deployment
and public-release gates remain unfinished. The full goal stays active.

### September 29 persistent local records and replay history

Browse attempts now save result metadata and versioned replays after recomputation
with the shared gameplay rules in a bounded worker. Results expose save success,
failure/retry and personal-best outcomes. Personal bests use completed unassisted
Standard runs, ordered by score, maximum combo and accuracy; assisted/failed runs
remain explicitly labeled in history. Exact map revisions, difficulties and rules
versions stay separate. Editor playtests and studies do not populate map records.

Added persistent replay loading through the actual engine, duplicate-safe attempt
IDs, transactional result/replay storage, removal/Undo and best recomputation.
Replay viewing never adds another attempt. Completion now shares one path for
normal frames and a pause/focus event that advances the session to its end, avoiding
a finished run stranded on the pause screen. Native and browser records stay local
and unranked. Limits are 1,000 attempts, 128 MB total replay data and 32 MB per
replay, without automatic eviction. The map list remains visible while scrolling
long detail/history panels. See [local records](maps.md#local-records-and-replays).

- `npm test`: 321 passing tests across 42 files. New cases cover score/combo/accuracy
  ordering, exact ties, assist/failure exclusions, persisted chart/rule/revision
  identity, shared-engine recomputation, malformed or modified replays, transactional
  failures, duplicate saves, capacity limits, damaged replay removal/Undo, unavailable
  storage and worker success/error/timeout cleanup.
- Type checking, production frontend and macOS debug app packaging pass. Vite
  reports a 500 kB chunk warning: the main JS bundle is approximately 505 kB
  minified / 157 kB gzip. Route splitting and real runtime performance measurements
  remain required; this build result is not a performance certification.
- Browser: a completed no-input Standard run saved seven misses and a zero-point
  first local best on the short fixture. A later 1,000,000-point Autoplay run saved
  to history without replacing that Standard best. Its persistent replay reproduced
  1,000,000 points, 100% accuracy and seven Perfect judgments. Reload preserved two
  attempts; replay viewing added none. The older map revision showed zero attempts.
  Removing the Standard record removed its best, and Undo restored it and its replay.
  No warning/error console entries appeared in the final verification log.
- Packaged macOS app: saved an Autoplay practice result, quit and relaunched the app,
  loaded the stored replay from Browse, and reproduced 1,000,000 points, 100% accuracy
  and seven Perfect judgments. History still contained one attempt afterward, and
  no Standard personal best was created from the assisted result.
- Screenshot evidence: ignored `.tools/screenshots/local-records-browser.png` and
  `persistent-replay-native.png`.

Device-wide record management for unavailable maps/damaged metadata, record backup,
large-library pressure/performance checks and the other platform/human playtests
remain open. There is no account sync, online score submission or human-input
attestation. Community, ranking services, deployment, signing and public-release
gates remain unfinished. The full public-beta goal stays active.

### September 29 local account/profile backend

Implemented the first online foundation with Hono on Workers and a local Supabase
Auth/PostgREST/PostgreSQL stack. The API verifies bearer identities, exposes public
profiles and atomically creates/updates the caller's own profile. Column grants and
RLS enforce ownership even through direct database API requests. Live session,
email verification, anonymous-account, ban and deletion checks prevent stale JWTs
or editable metadata from authorizing profile writes. No privileged key enters
the Worker or game. Profile request bytes/time, service timeouts, exact origins,
no-store responses and sanitized errors are bounded explicitly.

Recorded the initial browser/native memory-only session decision and remaining
account UI/recovery/persistence gates in [online implementation](online.md). There
is no sign-in screen, hosted service or community UI connection yet. The existing
game bundle and native permissions are unchanged.

- `npm test`: 359 passing tests across 45 files, including profile validation,
  identity propagation, denied origins, unverified/revoked accounts, malformed
  requests, stream timeouts and byte limits independent of Content-Length.
- `npm run test:db`: 40 passing pgTAP checks against the actual local PostgreSQL
  17/Supabase schema. Checks include cross-account reads/writes, column grants,
  forged owners/timestamps, duplicate names, unverified/banned/anonymous/deleted
  accounts, mismatched/expired/revoked sessions and deletion cascade. Test fixtures
  roll back.
- `npm run test:online`: 12 passing integration scenarios through actual local
  workerd, Auth and PostgREST, including password sign-in, unverified-email denial,
  public/private data separation, simultaneous username claims, forged JWT denial,
  direct-data access isolation and immediate sign-out/ban enforcement. Test users
  were removed and the temporary Worker stopped afterward.
- Frontend type checking/build and Worker type checking/dry-run build pass. The
  pre-existing approximately 505 kB frontend chunk warning remains; the API adds
  no bytes to that game bundle. Native code/UI were unchanged and not retested.
- `npm audit`: zero reported vulnerabilities after overriding Miniflare's Undici
  7.29.0 with patched 7.29.1. Hono 4.13.11, Supabase JS 2.117.2 and Wrangler 4.143.0
  are locked. Local verification used installed Supabase CLI 2.75.0; no global
  toolchain upgrade or hosted provisioning occurred.

The local stack was stopped with its volume retained after verification. Account
screens/recovery/deletion, friends/messages/presence/moderation, online maps and
rankings, direct-data abuse controls, deployment and every remaining platform,
performance, operational and public-release gate remain required. The complete
goal remains active; local backend tests do not establish production readiness.

### September 29 account screens and email recovery

Added the Account route and connected the header profile control to it. Configured
builds support sign-up, email codes, sign-in, username/name/bio editing, sign-out
and password recovery. The route lazily loads its Auth SDK; the app-owned client
retains its session across navigation but stores no credentials in persistent
browser/native storage. Sign-in explains that reloading/closing ends the local
session. Unconfigured builds retain guest play and explain that accounts are not
available. Code-only email templates support the browser hash router and desktop
without token-bearing redirects.

Added safe configuration validation before frontend bundling, field/error states,
resend cooldowns, plain-text profile previews, unsaved-edit guards, identity-bound
profile loading/saving, and retry after network failures. A separate native local
CSP overlay permits only the loopback Auth/API services; production native CSP and
capabilities have not been broadened. See [account setup and limits](online.md).

- `npm test`: 391 passing tests across 49 files. New coverage includes public-key
  configuration, credentials/OTP bounds, memory-only SDK options, local sign-out,
  recovery across refresh/account changes, failed sign-out, stale profile loads,
  newer-save ordering, cross-account responses and malformed service data.
- `npm run test:email`: seven real local email/Auth integration scenarios passed:
  confirmation templates, invalid/one-use codes, refresh, recovery event/password
  update, and rejection of the old password while the new password signs in. Only
  disposable local accounts and captured Mailpit messages were used and removed.
- Browser UI: registered a local test account, rejected a bad code, verified its
  email, created a profile, exercised unsaved navigation/sign-out guards, and
  retained sign-in across Browse/Account navigation. Reload required sign-in again.
  Recovery delivered a code, opened the new-password form, and cancellation signed
  out cleanly. Password replacement itself was exercised by the real Auth integration
  test; no completed browser/native password-form submission is claimed.
- Browser UI: intentionally stopped the local Worker, observed a recoverable
  profile error, restarted it and successfully retried. The final fresh verification
  tab had no warning/error console entries. At 720×600, the header reflowed and the
  document had no horizontal overflow; content remained vertically scrollable.
- Packaged macOS debug app: signed in to the same local account, loaded its saved
  profile, updated its bio and observed that update in the browser. Quitting and
  relaunching returned to sign-in. This does not validate Windows/Linux or every
  native Auth/recovery case.
- Frontend and native debug builds pass. The account chunk is about 233 kB minified
  / 61 kB gzip; the initial game chunk is about 506 kB / 157 kB gzip and retains its
  existing 500 kB warning. The API type check also passes. An intentionally invalid
  privileged-key configuration was rejected before bundling without echoing its value.
- Screenshot evidence: ignored `.tools/screenshots/account-profile-browser.png`
  and `account-profile-native.png`.

Local Auth/API services remain running for continued development; no hosted
service, public account or production deployment was created. Account deletion,
public player pages/moderation, remaining account settings and cross-platform
coverage, friends/messages/presence, online maps/rankings and all broader release
gates remain unfinished. The complete public-beta goal stays active.

### September 29 public profiles and account deletion

Added exact-username player lookup and public profile pages. Guests can read the
same public name/bio/profile-created date as signed-in players, with loading,
missing-user and retry states. The account screen links to the public page and
back to editing. Public content is rendered as text; no email, invented ranking,
presence or account-verification badge is exposed. A renamed username changes its
current profile address; permanent links/name policy remain part of release work.

Added a separate account-deletion screen with current-password authentication and
an exact `DELETE` confirmation. A temporary, non-persisting Auth client obtains a
fresh password session for the same identity; the Worker independently verifies
its live session and signed password-authentication timestamp. Ordinary data
requests keep the caller's JWT and public key. Only the narrow deletion adapter
uses a separate Worker secret to hard-delete the verified caller through Auth.
There is no caller-selected user ID or generic admin route. Local game data stays
on the device. See [deletion semantics and limits](online.md).

- `npm test`: 414 passing tests in 52 files. Added freshness/identity checks,
  isolated admin-key use, explicit confirmation, forged/revoked-token denial,
  missing-secret rejection, lost-response handling, temporary-session cleanup,
  deleted-account client disposal and public-profile response validation.
- `npm run test:online`: 18 real local scenarios pass. The new scenarios reject
  target-ID injection, incorrect password and edited JWT claims; age a disposable
  password proof and refresh it through real Auth; delete the fixture account;
  confirm profile removal and denial of old sessions, password sign-in, refresh
  and direct PostgREST writes. The other account remains intact. Fixtures and the
  private Worker env file are removed afterward. No hosted services are touched.
- Browser UI: own/public navigation, exact-name and uppercase/@ lookup, missing
  profile, signed-out viewing, unsaved-edit guard before deletion, disabled
  confirmation and cancellation all passed. The preview account was preserved.
  A fresh browser tab had no warning/error entries after sign-in, deletion-screen
  cancellation and profile navigation. Development hot reload had left stale
  router-blocker warnings in the earlier tab; they did not reproduce in the fresh
  session. At 720×600 there was no horizontal overflow.
- macOS debug app: guest exact-name lookup loaded the same real local profile.
  Frontend/native packaging and Worker dry-run build pass. The initial game chunk
  remains about 507 kB / 157 kB gzip with the existing size warning. Account/profile
  screens are separate lazy chunks sharing the Auth SDK.
- UI confirmation/cancellation was checked, but the permanent-delete button was
  not submitted interactively. Real irreversible deletion was verified through
  automated disposable local accounts. Completed browser/native deletion forms,
  Windows/Linux behavior and broader outage/race/platform tests remain release gates.
- Screenshot evidence: ignored `.tools/screenshots/public-profile-browser.png`
  and `public-profile-native.png`. A scan confirmed the local admin credential is
  absent from the frontend build and native source.

The local Worker now has the separate deletion binding in ignored `.dev.vars`;
no production key, hosted service, public deployment or new native capability was
added. Friends, private messaging, presence, blocking/reporting/moderation,
rankings and online map publishing are still required. Finalize deletion retention
for those records and backups before release. Complete operational, performance,
platform and public-playtest gates in the full plan. The goal remains active.

### September 29 friends and blocking

Connected the Friends route and public profile controls to real local community
data. Verified players can send, accept, decline and cancel requests, remove
friends, and block/unblock. The four private lists include loading, empty, error,
refresh and cursor-pagination states. Blocking atomically clears a friendship or
request and prevents requests in either direction; unblocking never restores one.
Public profiles remain public. No live presence or messages are implied.

Added canonical relationship pairs, generation IDs for stale-action protection,
private block ownership, live-session RLS, narrow database RPCs and shared API
authentication. Ordered participant locks serialize crossed requests, acceptance,
blocking and capacity checks. Database-enforced limits bound requests, friends
and blocks. Account deletion cascades these records. See the full behavior and
remaining abuse-control requirements in [friends and blocking](friends.md).

- `npm test`: 431 passing TypeScript tests across 55 files. Added request/response
  validation, identity isolation across delayed responses, pagination precision,
  private JWT propagation, bounded input and sanitized error-code mapping.
- `npm run test:db`: 113 passing pgTAP checks across three files. Real PostgreSQL
  coverage includes grants/RLS, recipient-only acceptance, stale generations,
  revoked/banned/unverified identities, all capacity limits, timestamp cursor ties,
  private block lists and deletion cascades. Transactional fixtures roll back and
  preserve the local preview accounts.
- `npm run test:online`: 26 real local workerd/Auth/PostgREST scenarios pass.
  Added crossed-send, repeated block/accept and block/send concurrency checks,
  direct-data restrictions, stale accept/unblock protection and deletion cleanup.
  Disposable integration users and temporary privileged Worker files are removed
  afterward. No hosted service or external player was contacted.
- Browser UI: accepted an incoming request, cancelled a sent request, blocked and
  unblocked a player, checked empty/private lists and navigated player profiles.
  Sent a new request in the browser and accepted it in the packaged macOS app;
  both clients then showed the accepted friendship. The three synthetic preview
  identities and their two accepted friendships remain available locally.
- A fresh browser session had no warning/error console entries. At 720×600,
  friend rows reflowed without horizontal overflow; the viewport was then reset.
  Screenshot evidence: ignored `.tools/screenshots/friends-browser.png` and
  `friends-native.png`. Interactive decline/remove, long-list paging and outage
  cases remain part of broader UI coverage; database/API checks cover the rules.
- Frontend type checking/build, Worker type checking/dry-run and final macOS debug
  packaging pass. The initial game chunk is about 507 kB minified / 158 kB gzip
  and retains its existing 500 kB warning. Friends loads as a separate screen.

Lists refresh on opening or explicit request; realtime updates, presence and
private messaging remain required. Reporting/moderation, online maps, rankings,
deployment, service load tests, signing, remaining platform/performance checks
and external playtests also remain open. Local services are retained for ongoing
development. This working local slice does not establish public readiness; the
complete public-beta goal remains active.
