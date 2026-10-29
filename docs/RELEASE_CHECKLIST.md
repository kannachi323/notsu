# Release checklist

Status of the public beta as of the October 28, 2026 production-readiness pass on
branch `production-ready`. Nothing has been pushed, deployed or published, and no
hosted services or accounts were created.

## 1. Build and deploy

### Web (Cloudflare Pages)

The browser game is the static Vite build in `dist/`. `public/_headers` ships a
CSP, `nosniff`, a referrer policy and immutable caching for hashed assets.

```sh
npm ci
npm test
npm run build                                   # tsc + vite build -> dist/
npx wrangler pages deploy dist --project-name notsu --branch main
```

- Offline build: leave `VITE_SUPABASE_URL`, `VITE_NOTSU_API_URL` and
  `VITE_SUPABASE_PUBLISHABLE_KEY` empty (or unset). Online build: set all three to
  the hosted values in the Pages project's build environment, never a secret key.
  The build refuses any `VITE_*` value that looks like a privileged key.
- `.env.local` on this machine points at the **local** Supabase stack. Unset those
  variables (or build in CI) for a public offline build so localhost URLs are not
  bundled.
- Once the API and Supabase origins are known, narrow `connect-src` in
  `public/_headers` from `https: wss:` to those exact origins.

### API (Cloudflare Worker, only for the online build)

```sh
npm run api:check
npx wrangler deploy --env production            # after adding a production env
```

- `wrangler.jsonc` holds local values (`SUPABASE_URL` = 127.0.0.1, localhost
  `ALLOWED_ORIGINS`). Add a production environment with the hosted Supabase URL
  and the real web/desktop origins (`https://<pages domain>`, `tauri://localhost`,
  `http://tauri.localhost`).
- Secrets: `npx wrangler secret put SUPABASE_PUBLISHABLE_KEY` and
  `npx wrangler secret put SUPABASE_SECRET_KEY` (server only).
- Create the R2 bucket `notsu-map-media`; the hourly cron sweeps orphaned media.

### Database (Supabase, only for the online build)

```sh
supabase link --project-ref <ref>
supabase db push                                 # applies supabase/migrations
```

- Match `supabase/config.toml` in the hosted dashboard: only the `public` schema
  exposed, Realtime private channels only, email confirmation on, password
  minimum length, SMTP sender configured. Moderators are added by inserting into
  `private.moderators` with the service role.

### Desktop (Tauri 2)

Build each bundle on its own OS (or in CI runners for each):

```sh
CARGO_BUILD_JOBS=4 npx tauri build                       # all targets for this OS
npx tauri build --bundles app,dmg                        # macOS
npx tauri build --bundles nsis,msi                       # Windows (MSVC + WebView2)
npx tauri build --bundles deb,appimage,rpm               # Linux (webkit2gtk 4.1)
```

- Bundles land in `src-tauri/target/release/bundle/`.
- The default `tauri.conf.json` CSP allows no network access (offline desktop
  build). For an online desktop build, add the hosted Supabase and API origins to
  `connect-src` (see `tauri.local.conf.json` for the local equivalent).
- Unsigned builds trigger Gatekeeper / SmartScreen warnings; see owner steps.

## 2. What was verified in this pass

Environment: macOS (Apple Silicon), Node 26, Rust 1.88, the in-app Chromium
browser, the local `notsu-local` Supabase stack in Docker.

**Build health**
- `tsc --noEmit` (app and `server/`): clean. No ESLint is configured; strict
  TypeScript (`noUnused*`, `strict`) is the lint gate, by decision (no new deps).
- `npm test`: 78 files, 558 tests pass (521 before this pass).
- `vite build` (offline, main chunk 552 kB / 172 kB gzip; Supabase client stays a lazy
  227 kB chunk) and `wrangler deploy --dry-run`: pass. No local service URLs in the bundle.
- Production build served with the `_headers` CSP: plays a map with no CSP refusals;
  `#/ui` (dev sheet) and online routes redirect home.
- `cargo check --locked` and the macOS release build: pass (section 4).

**Gameplay, played in the browser with real keyboard events timed on the audio clock**

| Pack | Difficulty | Input | Result |
| --- | --- | --- | --- |
| Orbit Signal | First light | exact | 1,000,000 · 28/28 Perfect · mean 0 ms; replay identical |
| Orbit Signal | Orbit | ±25 ms jitter | 1,000,000 · 48/48 Perfect |
| Violet Hours | Pulse | ±25 ms | 1,000,000 · 41/41 Perfect |
| Violet Hours | Afterglow | ±70 ms | 966,400 · 88.80% (47 Perfect / 28 Good), matches the formula |
| First Contact | Introduction | exact, +40 ms late with +40 ms offset | 1,000,000 · mean 0 ms (calibration offset applied correctly) |
| First Contact | Lift off | ±40 ms | 1,000,000 · 30/30 Perfect |

- Autoplay (1,000,000, saved as practice), No Fail (completes through 30 misses),
  failing at zero health (ended after 9 misses), pause → 3 s count-in → resume
  (labelled "Resumed · practice"), retry and replay playback. No console errors.
- Tap-along calibration measured exactly +30 ms for taps 30 ms late, and applied it.
- Editor: `.notsumap` import (2 difficulties), WAV song import, add circle →
  autosave survives reload, playtest scores the edited chart (17/17).
- Performance: 120 Hz display, p95 frame 9.3 ms, no frame over 20 ms during play.
  Heap sampling of the render/scoring loop went from ~8.4 KB to ~1.4 KB of garbage
  per frame (iterators, defensive copies, pose objects and sprite lookups removed).
- Controller: simulated standard gamepad changes songs, keeps focus, starts play,
  registers gameplay presses and pauses with Start.
- New tests: judgement window edges, score/accuracy/health formula, extras,
  failure point, allocation-free helpers, calibration, grades, timing histogram,
  upload draining, privileged-key guard.

**Offline**
- With no `VITE_*` configuration: Chat, Friends, Sign in, Publish, Online
  discovery and Get more maps are hidden; Discover opens the local library; every
  online-only route redirects home. No errors in the console.

**Online (local stack only)**
- All migrations apply; `supabase test db`: 8 files, 347 pgTAP checks pass.
- `npm run test:online`: 53 live checks pass (accounts, friends, messages,
  private Realtime, presence, reports/moderation, map publish/retry/withdraw/
  restore, deletion). One earlier Realtime check failed once and passed on rerun
  (flaky timing on a loaded machine).
- Fixed: the API reset the connection when answering an identical upload retry
  before reading the body (clients saw "fetch failed"). It now drains the upload.
- Security review of RLS, grants, definer functions, auth and upload validation
  found nothing critical. Fixed in migration `20261028001000_abuse_limits.sql`:
  full libraries are refused before upload and object writes per reservation are
  capped; restricted players cannot send/accept friend requests; moderators cannot
  hide another moderator's map. Only the three online env variables reach the bundle.

**UI**
- Generated cover art per pack, redesigned HUD (health, hit-error meter, graded
  judgement pops) and results (grade ring, stats, judgement bar, timing
  histogram), rebuilt Settings, editor in the app frame. Checked at 1440×900 and
  1024×700 with no horizontal scroll. CSS animations are gated on
  `prefers-reduced-motion: no-preference`; the in-game Reduced motion setting
  also freezes hit effects.
- Before/after screenshots: `docs/screenshots/before/` and `docs/screenshots/after/`.

### Final polish pass (October 28, later)

- **No all-caps text:** no `text-transform: uppercase` or small caps anywhere; mod
  badges use icons instead of NF/AT; grades are single letters (a clean 100% clear
  is a gold S with a star instead of "SS"); account deletion asks for `delete`
  (the API keeps its fixed token). Remaining capitals are acronyms and units
  (BPM, MB, MP3, WAV, JSON) and key names (Esc, F2).
- **One type family and scale:** the system UI stack (`--ui-font`) everywhere;
  the editor, gameplay legacy styles, menus and home now use the `--ui-text-*`
  scale and `--ui-space-*` spacing. Only display numerals (countdown, logo) and a
  few large layout gaps keep explicit sizes. The editor has no hard-coded colours.
- **Gaps closed:** the editor shows its stage on load with one sticky transport
  bar; How to play is six visual cards; duplicate back buttons removed from the
  playtest and library start screens; record-save and personal-best copy trimmed.
- **Screens walked:** home, song select, mods,
  gameplay, pause, results, settings, how to play, browse, editor landing and
  workspace, playtest start; online (local stack, signed out): account sign-in,
  friends, messages, publish, online catalog (empty state), player lookup
  (found/not found), reports and moderation. All have loading, empty or sign-in
  states; no dead buttons. There is no leaderboard screen: rankings are not built
  and nothing links to them.
- **Window sizes:** 1024×640, 1440×900 and 1920×1080 with no horizontal scroll.
- Screenshots: `docs/screenshots/polish/before/` and `docs/screenshots/polish/after/`.

## 3. Decisions made without the owner

- **No ESLint.** AGENTS.md forbids speculative dependencies; strict `tsc` is the lint step.
- **Generated cover art** instead of images: v1 packs have no cover field, so each
  set gets deterministic original art from its id. Imported packs get art too.
- **Letter grades (SS–F)** are presentation only, derived from accuracy, misses
  and extras; they never affect score, records or rankings.
- **Controller mapping:** face buttons/bumpers are gameplay keys, Start pauses; in
  menus A confirms, B goes back, D-pad navigates.
- **Upload caps:** at most 5 object writes per upload reservation; a library at
  quota is refused before any bytes are stored.
- **Web CSP** allows any HTTPS/WSS `connect-src` until hosted origins exist.
- **Desktop bundles** target every platform (`"targets": "all"`) with icons
  generated from `src-tauri/app-icon.svg`; macOS minimum 11.0.
- Online entry points are hidden, not disabled, in offline builds.

## 4. Desktop build result

- `CARGO_BUILD_JOBS=4 npx tauri build --bundles app,dmg` (offline env, release,
  unsigned, Apple Silicon): the release binary and `notsu.app` (10 MB) built in
  about 2.5 minutes. `Info.plist` has `dev.kannachi.notsu`, 0.1.0, minimum macOS 11.0
  and the generated `icon.icns`.
- The DMG step failed only at Tauri's Finder AppleScript layout step, which needs
  Automation permission in a GUI session. Re-running the generated
  `bundle_dmg.sh` with `--skip-jenkins` produced `notsu_0.1.0_aarch64.dmg`
  (8.2 MB). On a normal desktop session or a macOS CI runner, `tauri build` should
  complete on its own.
- Native smoke: the release app launched, opened its `notsu` window, ran with no
  errors on stderr and quit cleanly. Full in-app play was not repeated natively in
  this pass (earlier debug bundles passed native play/save checks; see
  `public-beta.md`).
- Windows and Linux bundles were not built here (no runners on this machine).

## 5. Owner steps before a public release

1. **Hosted Supabase**: create the project, `supabase db push`, match config.toml
   settings, configure SMTP for verification/recovery email, add moderators.
2. **Cloudflare**: Pages project and custom domain; Worker production env, secrets,
   R2 bucket, custom API domain; then narrow `connect-src` (web `_headers` and
   desktop `tauri.conf.json`) to those origins and set `ALLOWED_ORIGINS`.
3. **Domains**: register/point the web and API domains; enable HTTPS.
4. **Code signing**: Apple Developer ID + notarization for macOS; an Authenticode
   certificate for Windows; optionally sign Linux packages. Configure them in
   `tauri.conf.json` / CI secrets. Unsigned builds show OS warnings.
5. **Media-rights review**: confirm the generated starter music, background art
   (`src/features/home/assets/orbital-night.png`, made with an image generator)
   and gameplay atlas are cleared for distribution; keep the publish-time rights
   confirmation for user uploads.
6. **Human playtests**: musical/readability feedback on the starter maps, real
   keyboard/controller latency on each OS, and Windows/Linux runs of the bundles
   (only macOS was built here).
7. **Operations**: error/usage monitoring, backups, rate-limit review, and the
   remaining public-beta gates in [public-beta.md](public-beta.md) (verified
   rankings, attempt tickets and server replay recalculation are not built yet).
8. **Hardening follow-ups from the review** (low severity): allow 2–3 concurrent
   uploads per Worker isolate; wrap `auth.uid()` as `(select auth.uid())` in hot
   RLS policies; rate-limit anonymous catalog search; strip bidi/zero-width
   characters from display names, bios and messages.
