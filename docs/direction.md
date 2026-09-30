# Implementation direction

## Scope

notsu is an independent rhythm game and unofficial community project. The accepted
September 29 public beta targets desktop browsers, Windows, macOS and Linux.
Each target still needs its own release validation. The full accepted scope and
release gates are tracked in [public-beta delivery](public-beta.md). The earlier
companion and Trivia research below remains historical context.

The selected stack is Tauri 2 with React, TypeScript, HTML/CSS, and Vite. Keep
ordinary application logic in TypeScript and add Rust native integration as
needed. Start from the official template; see [setup guidance](setup.md).
Learning or contributing to osu!'s own codebase is a separate goal and does not
determine this application's dependencies.

Trivia remains a planned casual feature. Preserve its fixture-based, deterministic
daily design and its separate boundary. Rhythm is implemented independently; do
not create a general game framework. Home links to song selection, local authoring,
map browsing and the implemented account/community routes.

## Current direction: September 29 song selection and gameplay redesign

The user requested a closer emulation of osu!'s playing, song selection and map
browsing screens. This supersedes the earlier outlined-card home and separate
prototype menu below. The default reference is modern osu!lazer, with original
notsu identity, artwork, music and moving-line mechanics.

Research reviewed the [game repository](https://github.com/ppy/osu),
[framework repository](https://github.com/ppy/osu-framework),
[interface documentation](https://osu.ppy.sh/wiki/en/Client/Interface), and
[map archive format](https://osu.ppy.sh/wiki/en/Client/File_formats/osz_(file_format)).
The wiki interface page describes the classic client. For current visual context,
the July 2026 [community lazer interface guide](https://osu.ppy.sh/community/forums/topics/2221264)
was reviewed, including its song-selection screenshot. It is a community guide,
not an official developer design specification. No source or official art was copied.

The implemented direction uses:

- A static illustrated backdrop, compact navigation, a prominent Play action and
  quieter Browse/Create choices on Home.
- Song information, real local results and pack tools on the left; searchable,
  stacked song cards and expanded keyboard-accessible difficulties on the right.
  A persistent bottom bar owns practice modifiers, Random, Preview and Play.
- An artwork grid for Browse, with actual library entries and clear Included/Local
  labels. Do not invent online counts, star ratings or ranked status.
- A dimmed playfield background and HUD at its edges: score/accuracy top-right,
  health top-left, combo bottom-left and progress at the bottom. Authored lines and
  cyan/violet circles remain the focus. Pause and results retain real engine state.
- Complete `.notsumap` packs as the public playback entry. Three original starter
  packs include recordings and difficulties. Selecting a map never asks the player
  to find a separate MP3. Local recording import belongs to the editor.

Artwork is `src/features/home/assets/orbital-night.png`, created with the built-in
image generator; its prompt is saved alongside it. It is shared interface art,
not a map-cover extension to the package format. Keep the background static,
visible focus, keyboard controls, reduced motion, and clear unofficial attribution.
At small widths song cards flow above details and the play bar stays available.

## Historical home-screen direction (superseded)

The approved September 26, 2026 reference is the user-supplied notsu mockup with
a nearly black background, subtle outlined surfaces, cyan orb-and-line artwork,
and a larger central Play card between Browse and Editor. Implement the artwork
as original, static SVG rather than shipping the generated image as a background.

Keep the notsu logo at the far left. Place Play, Browse, Editor, and the music icon
beside it; put profile, chat, and friends on the right. The player lives in its
own dropdown card under the music icon. Use equal top/bottom header padding and
anchor the update card near the footer, allowing the activity area to absorb
extra height. Smaller windows reflow and scroll instead of clipping controls.

React Router and Zustand are the approved routing/UI-state baseline. Home is a
separate feature and the existing Rhythm prototype remains available through Play.
The dropdown, Play, local Editor, local Browse and Account routes are wired;
Friends is connected to private request/friend/block lists; Chat opens private
conversations with accepted friends. The account screen continues the dark
cyan/violet palette with a static orb, clearly labeled forms and a text-only public
profile preview. Public player pages share this visual language and show real
public profile fields only, with exact-name lookup and explicit missing/error
states. Account deletion has a separate confirmation screen. Keep keyboard access, visible focus, Escape dismissal, reduced-motion
support, and an unobtrusive unofficial-community-project attribution. Do not show
fabricated live performance or playback metrics.

## Retained gameplay art and mechanics

The user approved a minimal dark blue-gray stage, shaded cyan tap orbs, violet hold
ribbons, and a hollow target ring. Short local hit effects are allowed; avoid
background particle fields, bloom, drum imagery, or colour-to-key matching.
Independent straight lines move, rotate and change length to authored musical
beats, forming polygons and other geometric arrangements. Shared circles at one
timestamp take one press. Lines do not transfer notes at intersections. Every
movement has a scheduled start, destination, and arrival.
The same musical phrase can reuse the same movement vocabulary.

The earlier prototype menu was a simple rhythm-game screen, inspired by the clarity
of osu! and other rhythm-game menus without copying their branding or artwork.
Use the game's own orb-and-line motif, a large wordmark, and only Play, Settings,
and How to play in the Rhythm menu. It put chart selection and local audio loading behind Play,
and preferences on their own screen. No slogans, promotional copy, prototype
badges, or decorative uppercase labels. Its menu body text was 18px; ancillary labels
and gameplay text were at least 16px. These prototype-menu rules are historical;
the current public flow and layout are specified above. Preserve both skin palettes, visible keyboard
focus, native radio-keyboard selection, and Escape/back navigation. Keep the home
art static, including with reduced motion. Do not add speculative menu destinations.

This supersedes the old black-and-sage palette below, which is retained as
historical reference only. The approved September 29 cyan/violet sprite sheet is preserved as
`src/features/rhythm/assets/gameplay-reference.png`. It is a style reference, not
a production atlas; exact bounds, anchors and clean exports are still required. See [Rhythm](rhythm.md) for mechanics, limitations, and verification.

## Historical supplied design reference

Reference: `~/projects/moku-project/Moku-iOS`. Inspected the actual theme,
page headers, home surfaces, feature layout, and an implemented settings screenshot.

- Background: `#080808`; surface: `#171717`; sage accent: `#7AAA7A`.
- Native system typography, semibold page titles around 19 points, and muted
  secondary text. Preserve text scaling and clear hierarchy.
- Rounded cards around 16 points, subtle borders, and restrained density.
- Compact centered headers, 44-point touch targets, and pill-shaped actions.
- Quiet transitions and feedback that respect Reduce Motion.
- Moku uses 10-point outer page padding and 24-point section spacing on Home.
  Adapt spacing for readable trivia questions rather than reproducing a screen.

The source is `Moku/Shared/Theme/NavigationStyle.swift`,
`Moku/Shared/Components/PageHeader.swift`, and
`Moku/Shared/Components/HomeSurface.swift` in that project.
These previous notes are not the current Rhythm specification. Retain the lessons
about hierarchy and restraint, but do not reintroduce the superseded palette.
Confirm current references before unrelated substantial UI work.

The local editor follows the current dark cyan/violet direction, with line tools,
the shared gameplay stage, a waveform/beat timeline and note controls. It is an
initial functional authoring slice; see [editor status](editor.md). Keep the
historical references below intact.

## Initial osu! data research

Reviewed the [official API v2 documentation](https://osu.ppy.sh/docs/index.html).
Public reads can use OAuth client credentials with the `public` scope. Keep
the secret in a future developer-side importer, never in the distributed app.
The documented ceiling is 60 requests/minute; caching is encouraged, and bulk
harvesting should use [official data dumps](https://data.ppy.sh/) instead.

`GET /beatmaps/{id}` and beatmapset metadata support textual trivia. Distinguish
individual difficulties from sets: BPM, length, and difficulty belong to maps;
ranked date and favourites belong to sets. Mapper questions must account for
multiple owners and guest difficulties. Reject missing data and tied answers.

Artist, ranked-date, BPM, and length questions are promising initial candidates.
Difficulty and popularity need a frozen snapshot and precise wording. Player
statistics are mode-dependent and change over time; defer those categories.
No dataset has been imported or verified yet.

Use a bundled snapshot first. Proposed challenge identity: UTC date + algorithm
version + dataset fingerprint. Store the generated questions and each answer
immediately. UTC gives everyone the same rollover; explain that in the eventual UI.

## Historical companion integration research

- Official API: evaluate player profiles, beatmaps, and scores against documented
  routes and scopes. The documented authorization-code exchange requires a client
  secret; the reviewed documentation does not describe PKCE. Confirm a supported
  native-client approach or a trusted broker before implementing sign-in.
- Local integration: investigate user-selected installations, collections, replay
  files, and opening maps separately. Identify undocumented formats explicitly.
- Community services: before introducing a dependency, document what it provides,
  supported integration mechanisms, reliability, authentication, licensing/terms,
  and which functionality notsu owns versus delegates.

None of these integrations is implemented or required by the accepted public beta.
The current account plan is notsu-owned email/password authentication through
Supabase; it does not connect external game accounts or use social OAuth.

## Identity and assets

Follow the [official brand guidance](https://osu.ppy.sh/wiki/en/Brand_identity_guidelines):
keep `osu!` lowercase and identify this as an unofficial community project.
Use an original app identity. No official logo or third-party media has been copied.

The [copyright policy](https://osu.ppy.sh/legal/en/Copyright) is not a blanket
redistribution license for songs or beatmap artwork. API caching guidance likewise
does not establish redistribution rights for every asset. Start with structured
text and source attribution; review dataset terms before distributing a snapshot.
No general API-specific attribution mandate was identified in the reviewed API
documentation; retain provenance and recheck applicable terms before release.
