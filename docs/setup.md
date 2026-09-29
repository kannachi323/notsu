# Development setup

## Foundation

The app was initialized from the official `create-tauri-app` React/TypeScript
template and adapted to this repository's feature-first structure. The unused
greeting command, opener plugin, example assets, and native permissions were
omitted. The native host uses Tauri 2 with a bounded skin-save and map-save IPC commands.

Frontend package versions and Rust dependencies are locked in `package-lock.json`
and `src-tauri/Cargo.lock`. React, React DOM, React Router, and Zustand are the
frontend runtime packages alongside the Tauri core API and ZIP codec. Vitest is used for tests; no separate browser or DOM
test dependency is installed. The native application identifier is
`dev.kannachi.notsu`; the product/window name is notsu and the package name is `notsu`.
The identifier change creates a separate native app identity from earlier builds.
The online foundation adds Hono/Supabase and Wrangler under `server/`; these are
not imported by the game bundle. See [local online setup](online.md).

## Prerequisites

- Node.js 22.12+ or a newer supported LTS, with npm.
- Rust/Cargo and the target operating system’s native development requirements
  for desktop builds (including MSVC/WebView2 on Windows). Browser development
  does not require Rust.
- Follow the [official platform prerequisites](https://v2.tauri.app/start/prerequisites/).
  Windows, macOS and Linux release verification is still pending.

Do not install toolchains or dependencies, compile, or run builds/tests without
an explicit user request. The accepted public-beta goal explicitly authorizes its implementation and
verification. Dependencies were restored with `npm ci` for that work; the frontend
test/build evidence is recorded in `docs/public-beta.md`. No native toolchain has
been installed as part of this slice.

## Commands

```sh
npm ci
npm run dev
npm test
npm run build
npm run tauri dev
```

The dev server uses port 1420 with strict port checking. Stop an existing browser
dev server before `tauri dev`, which starts its own. To build an executable without
installers from PowerShell:

```powershell
npm.cmd run tauri -- build --debug --no-bundle
```

Use `npm.cmd` to forward arguments reliably through PowerShell. The build writes
`src-tauri/target/debug/notsu.exe`. Release packaging is separate from the debug
smoke build; signing and installer distribution have not been configured.

## Frontend and native boundaries

React Router's `createHashRouter` keeps routes inside the packaged document, avoiding
server fallback requirements. `/#/` opens the notsu home screen; `/#/rhythm` opens
the existing prototype; `/#/editor` opens the local creator workflow, and
`/#/browse` opens the local map library. The data
router enables unsaved-draft navigation guards. `/#/account` loads the account
screen separately and connects to configured online services. Unknown routes return to Home. The home feature owns a
small, non-persisted Zustand store for its music dropdown. Playback controls and
the remaining future-feature buttons are presentational only.

React owns setup, settings, HUD, and results. Canvas draws each animation frame
without React state updates per frame. Pure TypeScript owns scoring, chart
validation, multiple-lane movement interpolation, and replay recomputation. Web Audio owns the timing clock. No
per-note or per-frame data crosses the native bridge.

Audio is selected through the browser's file chooser and decoded locally. There
is no frontend filesystem permission, telemetry, or uploaded audio. Preferences
use local storage; imported skin archives and editor drafts/original recordings
and map packages use separate IndexedDB databases. Local map results/replays use
a separate bounded record database; editor/study replays remain in memory. Publishing/storage/backend
services in the public-beta plan have not been deployed. A separately tested local
Supabase profile API and account screen are implemented and exercised locally;
see [account setup](online.md) for browser and native configuration.
The Rhythm preference key retains its legacy `osu-base` prefix for compatibility
with earlier browser sessions; new native app identity storage is separate.

The Rust process is a local desktop host, not a secret-holding remote backend.
Add narrow commands or official plugins only when a concrete native feature needs
them; validate inputs and grant the smallest necessary capability scope.

Skin and map exports use a Rust-owned Save dialog and atomic file replacement. The main
window can invoke only `save_skin_pack` (16 MB) and `save_map_pack` (128 MB),
supplying a bounded binary archive and
sanitized suggested name; it cannot supply a destination path. Dialog/filesystem
plugin commands are not granted to the frontend. Tauri API 2.11.1 and dialog plugin
2.7.0 are locked with the existing Tauri 2.11.6/Rust 1.88-compatible dependency set.
The local macOS debug bundle (`npm run tauri -- build --debug --bundles app`) has
passed save, cancel, import, re-export and Autoplay smoke checks. This is an unsigned
development bundle; Windows/Linux native and production release checks remain.

## References

- [Official project generator](https://v2.tauri.app/start/create-project/)
- [Project structure](https://v2.tauri.app/start/project-structure/)
- [Vite configuration](https://v2.tauri.app/start/frontend/vite/)
- [Capabilities](https://v2.tauri.app/security/capabilities/)
