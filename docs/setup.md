# Development setup

## Foundation

The app was initialized from the official `create-tauri-app` React/TypeScript
template and adapted to this repository's feature-first structure. The unused
greeting command, opener plugin, example assets, and native permissions were
omitted. The native host uses Tauri 2 with no application IPC commands.

Frontend package versions and Rust dependencies are locked in `package-lock.json`
and `src-tauri/Cargo.lock`. React, React DOM, React Router, and Zustand are the
frontend runtime packages. Vitest is used for tests; no separate browser or DOM
test dependency is installed. The native application identifier is
`dev.kannachi.notsu`; the product/window name is notsu and the package name is `notsu`.
The identifier change creates a separate native app identity from earlier builds.

## Prerequisites

- Node.js 22.12+ or a newer supported LTS, with npm.
- Rust and Cargo, Windows MSVC C++ build tools, and WebView2 for desktop builds.
- Follow the [official Windows prerequisites](https://v2.tauri.app/start/prerequisites/).

Do not install toolchains or dependencies, compile, or run builds/tests without
an explicit user request. The home-screen update only resolved dependency metadata
into the lockfile; it did not install the new runtime packages or run builds/tests.

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

React Router's `HashRouter` keeps routes inside the packaged document, avoiding
server fallback requirements. `/#/` opens the notsu home screen; `/#/rhythm` opens
the existing prototype. Unknown routes return to Home. The home feature owns a
small, non-persisted Zustand store for its music dropdown. Playback controls and
the remaining future-feature buttons are presentational only.

React owns setup, settings, HUD, and results. Canvas draws each animation frame
without React state updates per frame. Pure TypeScript owns scoring, chart
validation, and movement interpolation. Web Audio owns the timing clock. No
per-note or per-frame data crosses the native bridge.

Audio is selected through the browser's file chooser and decoded locally. There
is no unrestricted filesystem plugin, network download, telemetry, or uploaded
audio. Only preferences are stored in browser local storage.
The Rhythm preference key retains its legacy `osu-base` prefix for compatibility
with earlier browser sessions; new native app identity storage is separate.

The Rust process is a local desktop host, not a secret-holding remote backend.
Add narrow commands or official plugins only when a concrete native feature needs
them; validate inputs and grant the smallest necessary capability scope.

## References

- [Official project generator](https://v2.tauri.app/start/create-project/)
- [Project structure](https://v2.tauri.app/start/project-structure/)
- [Vite configuration](https://v2.tauri.app/start/frontend/vite/)
- [Capabilities](https://v2.tauri.app/security/capabilities/)
