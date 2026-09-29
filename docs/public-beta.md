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
| Creator workflow | Import song -> author -> save/reopen -> export -> play without code | Pending |
| Community | Deployed accounts/maps/friends/messages/moderation, authorization checks | Pending |
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
