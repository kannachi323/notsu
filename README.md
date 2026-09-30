# notsu

An independent rhythm game built around moving lines and timed circles. This
unofficial community project is not affiliated with or endorsed by ppy.

**Play** opens song selection with searchable song cards, multiple difficulties,
practice modifiers, audio previews and local records. **Browse maps** shows the
collection as an artwork grid. Three starter packs include original music and two
difficulties each, ready to play without a separate audio file. Imported
`.notsumap` packs also contain the full recording and charts.

Gameplay combines independent moving lines, taps, holds and shared hits with
health, accuracy, combo scoring and replays. **Create** opens the manual editor
with local song import, line choreography, autosave and engine playtests. Settings
include skins, volume, timing calibration and motion preferences. Account,
profile, friends, private messaging and reporting screens connect to configured
online services; those services are exercised locally and are not publicly hosted.
The [public-beta plan](docs/public-beta.md) targets desktop browsers, Windows,
macOS and Linux. This is development work in progress, not a public-ready release.
The macOS debug app has passed local smoke checks. Production platform releases,
online services and public deployment still require implementation and verification.

Trivia remains a separate planned feature; its placeholders are preserved.

## Run

Browser development requires Node.js 22.12+ (or a newer supported LTS) and npm.
Desktop development additionally requires Rust and the target platform's native
tools. See [setup](docs/setup.md) for prerequisites.

```sh
npm ci
npm run tauri dev
```

For browser-only development, use `npm run dev` and open the printed local URL.
Use `npm test` for domain/audio-clock tests and `npm run build` for type checking
and the production frontend. Native smoke build on Windows PowerShell:

```powershell
npm.cmd run tauri -- build --debug --no-bundle
```

The native executable is written to `src-tauri/target/debug/notsu.exe`.
Use `npm.cmd` when forwarding flags in PowerShell to avoid wrapper argument loss.

## Play a map

- Open **Play**, select a song and difficulty, then press **Play**. **Orbit Signal**,
  **Violet Hours** and **First Contact** already include their music. Use **Import
  pack** to add another `.notsumap`; no separate MP3 upload is needed.
- Press any letter, number, punctuation key or Space when a circle reaches its
  moving target. Shared circles at one timestamp take one press.
- For a hold ribbon, press its solid head and release its hollow endpoint with the
  same key. Use other keys for taps during a hold. Key repeats and shortcuts are
  ignored. Misses and extra presses break combo, lower accuracy and cost health.
  Zero health ends the run. Score weights combo continuity at 70% and accuracy at 30%.
- Use **No Fail** to practice or **Autoplay** to watch. Both are unranked. Local
  results and replays save on this device and appear beside the selected difficulty.
  **Preview** plays up to fifteen seconds of the packaged recording.
- Escape or focus loss pauses. Resume preserves position and score with a
  three-second count-in; re-grab active hold keys before continuing. Resumed runs
  count as practice. Retry starts fresh; Song selection returns to your chosen map.
- Open **Settings** to choose a built-in skin or import a [skin pack](docs/skins.md)
  with artwork, sounds and colors. Adjust music/hit volumes, timing offset and
  reduced motion. **Freeze line movement** is a separate unranked practice assist.

The included tracks are short original synth arrangements. Human musical and
readability playtesting remains necessary before a public release. See
[included maps](docs/starter-maps.md) and [gameplay rules](docs/rhythm.md).

## Create a local map

Open **Create**, choose an MP3/WAV song, select lines, and place taps or holds on
the beat grid. Add geometric patterns and timed movement, then use **Playtest**
to play the actual chart. Drafts and original recordings are saved on this device;
Undo/Redo and backups help recover edits. Create additional difficulties, then
prepare a `.notsumap` package containing the song and charts. Save it, add it to
**Browse**, or import it into the editor on another device. Publishing and
advanced authoring tools remain in progress. See [editor usage and limits](docs/editor.md)
and [map packages and local browsing](docs/maps.md).

## Structure

```text
src/
  main.tsx                   Standard frontend entry point
  app/                       Composition and global styles
  features/
    home/                    Home, shared navigation, and original background artwork
      components/            Header, activity menu, and original SVG identity
    rhythm/                  Feature screen, hook, and presentation state
      components/            Menus, results, and Canvas renderer
      domain/                Pure scoring, Chart v2, timing, geometry, and replay rules
      data/                  Authored charts, audio, and local preference adapters
    skins/                   Appearance contracts, pack import/storage, and previews
      domain/                Manifest validation and built-in palettes
      data/                  Bounded ZIP/PNG/WAV handling and IndexedDB storage
      components/            Skin picker, preview, and pack controls
    editor/                  Local song authoring and engine playtests
      domain/                Draft validation, edit commands, geometry and history
      data/                  Transactional autosave and map-package conversion
      components/            Timeline, line/note tools, metadata and recovery
    maps/                    Local map collection and portable packages
      domain/                Map-set and difficulty contracts
      data/                  Archive validation, revisions and local storage
      components/            Search, selection, export and play entry
    trivia/                  Preserved future feature boundary
  shared/                    Only genuinely shared responsibilities
src-tauri/
  src/                       Minimal Rust desktop host
docs/                        Setup, direction, and feature notes
```

React Router provides hash-based routes for the desktop WebView: `/` is Home and
`/rhythm` opens song selection, `/editor` opens local authoring, and `/browse`
opens the map grid. `/settings` and `/how-to-play` provide preferences and help.
Zustand owns feature-specific shared UI state such as the skin catalog.
React and React DOM render the UI; Vite, TypeScript, Vitest, and the Tauri CLI are
development tools. The playfield uses Canvas 2D and Web Audio directly.

Keep scoring independent of rendering and audio APIs. Group code by feature,
colocate tests, and avoid duplicate rules in Rust. Keep semantic controls,
keyboard navigation, visible focus, and reduced-motion support. Commit both
`package-lock.json` and `src-tauri/Cargo.lock`.

Accounts use verified email/password sign-in and backend access policies. Online
map publishing, competitive rankings and public hosting remain pending. Never embed
privileged service keys in frontend assets or Rust binaries.
