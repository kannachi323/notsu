# notsu

An unofficial desktop companion for osu!. This community project is not affiliated
with or endorsed by ppy. Windows is the initial target.

The home screen brings together Play, Browse, Editor, a music dropdown, and
player/social controls in a dark, cyan-accented shell. **Play** opens the existing
**Rhythm** prototype: a single moving lane with timed taps, hold releases, and
music-synchronized movement. Browse, Editor, profile, chat, friends, and update
actions are UI placeholders. The music card opens and closes; playback is not
connected. No song audio or artwork is bundled.

Trivia remains a separate planned feature; its placeholders are preserved.

## Run

Requires Node.js 22.12+ (or a newer supported LTS), npm, Rust, the Windows C++
build tools, and WebView2. See [setup](docs/setup.md) for the native prerequisites.

```sh
npm install
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

## Play the prototype

- Open **Play** from the notsu home screen, then **Play** in the Rhythm menu,
  and select **Timing study** for ten seconds
  of original synthesized practice.
- Select **Two-hand rhythm drill** for a slower, 144 BPM practice of dotted
  rhythms, triplets, sixteenth rolls, and holds with independent taps. Try
  alternating F/J; all normal gameplay keys remain interchangeable.
- For **Mou Ii Kai?**, select your own `audio.mp3` from the 88-second cut in
  beatmap set 807850. The app verifies the exact recording locally. The chart
  covers 0:35.401–1:15.401; no music or artwork is included in this repository.
  The challenge arrangement adds short two-hand rolls and syncopated patterns,
  with recovery gaps between the fast passages.
- Press any letter, number, punctuation key, or Space when an orb's centre crosses
  the target ring.
- For a hold ribbon, press its solid head and release its hollow endpoint with the same key. Use
  other keys for taps during the hold. Key repeats and shortcut combinations
  are ignored. Missing notes or pressing extra keys breaks combo and lowers accuracy.
- Escape or focus loss stops the attempt. Retry starts from a fresh countdown;
  mid-run resume is deliberately not supported in this prototype.
- Open **Settings** from the Rhythm menu to choose Midnight or High Contrast, adjust music
  and hit-sound volumes separately, and set timing offset or reduced motion. Reduced motion
  keeps the lane stationary and hit highlights static. Only preferences are saved
  locally; audio and results are not persisted.

The song chart is an original beat-grid study, not an imported gameplay pattern
or a finished transcription. Its rhythm and choreography need musical playtesting.
See [Rhythm design and testing](docs/rhythm.md).

## Structure

```text
src/
  main.tsx                   Standard frontend entry point
  app/                       Composition and global styles
  features/
    home/                    Home layout, music dropdown, and Zustand UI store
      components/            Header, activity cards, and original SVG artwork
    rhythm/                  Feature screen, hook, and presentation state
      components/            Menus, results, and Canvas renderer
      domain/                Pure TypeScript scoring, input rules, chart geometry
      data/                  Authored charts, audio, and local preference adapters
    trivia/                  Preserved future feature boundary
  shared/                    Only genuinely shared responsibilities
src-tauri/
  src/                       Minimal Rust desktop host
docs/                        Setup, direction, and feature notes
```

React Router provides hash-based routes for the desktop WebView: `/` is Home and
`/rhythm` preserves the prototype. Zustand owns the home music dropdown state.
React and React DOM render the UI; Vite, TypeScript, Vitest, and the Tauri CLI are
development tools. The playfield uses Canvas 2D and Web Audio directly.

Keep scoring independent of rendering and audio APIs. Group code by feature,
colocate tests, and avoid duplicate rules in Rust. Keep semantic controls,
keyboard navigation, visible focus, and reduced-motion support. Commit both
`package-lock.json` and `src-tauri/Cargo.lock`.

Account connection and other companion capabilities are future work. Resolve
supported desktop OAuth and secret handling before implementing authentication.
Never embed production client secrets in frontend assets or Rust binaries.
