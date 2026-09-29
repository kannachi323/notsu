# notsu

An independent rhythm game built around moving lines and timed circles. This
unofficial community project is not affiliated with or endorsed by ppy.

The home screen brings together Play, Browse, Editor, a music dropdown, and
player/social controls in a dark, cyan-accented shell. **Play** opens the existing
**Rhythm** prototype: independent moving lines with timed taps, holds, shared hits,
health, scoring, and replay playback. Browse, Editor, profile, chat, friends, and update
actions are UI placeholders. The music card opens and closes; playback is not
connected. Practice audio is synthesized locally; no third-party song audio or
artwork is bundled.

The [public-beta plan](docs/public-beta.md) targets desktop browsers, Windows,
macOS and Linux. This is development work in progress, not a public-ready release.
Native builds, online services and public deployment still require verification.

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

## Play the prototype

- Open **Play** from the notsu home screen, then **Play** in the Rhythm menu,
  and select **Timing study** for ten seconds
  of original synthesized practice.
- Select **Two-hand rhythm drill** for a slower, 144 BPM practice of dotted
  rhythms, triplets, sixteenth rolls, and holds with independent taps. Try
  alternating F/J; all normal gameplay keys remain interchangeable.
- Select **Moving together** for a four-line, rotating-square study. Simultaneous
  circles at multiple targets share one judgment and take one press. Its original
  synthesized practice audio is included.
- For **Mou Ii Kai?**, select your own `audio.mp3` from the 88-second cut in
  beatmap set 807850. The app verifies the exact recording locally. The chart
  covers 0:35.401–1:15.401; no music or artwork is included in this repository.
  The challenge arrangement adds short two-hand rolls and syncopated patterns,
  with recovery gaps between the fast passages.
- Press any letter, number, punctuation key, or Space when an orb's centre crosses
  the target ring.
- For a hold ribbon, press its solid head and release its hollow endpoint with the same key. Use
  other keys for taps during the hold. Key repeats and shortcut combinations
  are ignored. Independent holds can overlap on different keys. Missing notes or
  pressing extra keys breaks combo, lowers accuracy, and costs health. Zero health
  ends the run. Score gives 70% weight to combo continuity and 30% to accuracy.
- Use **No Fail** for practice or **Autoplay** to watch a chart. These modes never
  qualify for rankings. Results offer replay playback; current replays stay in
  memory until leaving the result flow.
- Escape or focus loss pauses the attempt. **Resume** preserves the position and
  score and gives a three-second count-in; re-grab active hold keys before
  continuing. Resumed runs are practice. **Retry** starts a fresh attempt.
- Open **Settings** from the Rhythm menu to choose a built-in skin or import a
  [skin pack](docs/skins.md) with PNG artwork, WAV sounds, and theme colors. Preview
  sounds, retain packs locally, and undo removal. Adjust music and hit sound
  volumes separately, timing offset, or reduced motion. Reduced motion keeps hit
  highlights static while preserving authored line motion. Preferences and skin
  packs are saved locally; song audio and results are not persisted.
- **Freeze line movement** is a separate practice assist in Settings. It preserves
  each line's opening pose without changing note timing, and excludes the run
  from rankings. Replays retain both movement assistance and resumed status.

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
      domain/                Pure scoring, Chart v2, timing, geometry, and replay rules
      data/                  Authored charts, audio, and local preference adapters
    skins/                   Appearance contracts, pack import/storage, and previews
      domain/                Manifest validation and built-in palettes
      data/                  Bounded ZIP/PNG/WAV handling and IndexedDB storage
      components/            Skin picker, preview, and pack controls
    trivia/                  Preserved future feature boundary
  shared/                    Only genuinely shared responsibilities
src-tauri/
  src/                       Minimal Rust desktop host
docs/                        Setup, direction, and feature notes
```

React Router provides hash-based routes for the desktop WebView: `/` is Home and
`/rhythm` preserves the prototype. Zustand owns the home music dropdown and skin catalog state.
React and React DOM render the UI; Vite, TypeScript, Vitest, and the Tauri CLI are
development tools. The playfield uses Canvas 2D and Web Audio directly.

Keep scoring independent of rendering and audio APIs. Group code by feature,
colocate tests, and avoid duplicate rules in Rust. Keep semantic controls,
keyboard navigation, visible focus, and reduced-motion support. Commit both
`package-lock.json` and `src-tauri/Cargo.lock`.

The approved account plan uses verified email/password sign-in with backend access
policies. Accounts, maps, friends, messaging and competitive rankings are still
pending. Never embed privileged service keys in frontend assets or Rust binaries.
