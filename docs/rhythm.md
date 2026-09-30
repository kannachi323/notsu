# Rhythm gameplay

The public Play route now uses [song selection and complete map packs](maps.md),
including three bundled songs. The original standalone study selector is internal
legacy code; players do not need to locate an MP3 to play a map. The engine rules
and technical study notes below remain relevant.

## Menu

Home contains Play, Settings, and How to play. Play opens a keyboard-accessible
chart radio list and its details. Audio loading is only shown for the song chart;
the synthesized practice charts are playable without a file. Settings apply and
save immediately. Home buttons and Escape return from each menu screen, restoring
focus to the corresponding home action. Pausing or finishing a chart offers Home.
The menu uses the selected skin's colors with static, original orb-and-line art.
Avoid slogans and forced uppercase. Body text is 18px and secondary text at least
16px, including gameplay and results labels.

## Rules

Independent straight lanes carry shaded tap orbs and hold ribbons toward target rings.
The orb's centre crossing the ring is the timing cue. Holds have a solid press
head and a hollow release endpoint; shape distinguishes the two independently
of color. A pressed head stays at the target while its ribbon shortens. Taps
draw above all ribbons, including fading failed holds.
Normal character keys and Space are interchangeable; modifiers, shortcuts, Tab,
Enter, function keys, arrows, and repeated keydown events do not score. Controls
retain normal keyboard behavior when focused.

Each press consumes at most one eligible head in chronological order. A hold
owns its starting physical key until released; other keys can tap during it.
Independent holds may overlap on different physical keys. Simultaneous circles
are visual instances of one logical note with several lane IDs: one press scores
them once. Shared holds have one head and tail. Separate heads with identical
timestamps are rejected; the editor must merge them into a shared hit.
Hold release timing is scored independently.
An early or overdue release misses once; re-pressing cannot rescue it.

| Judgement | Absolute timing error | Accuracy weight |
| --- | --- | --- |
| Perfect | 0–45 ms | 1 |
| Good | >45–90 ms | 0.7 |
| Okay | >90–140 ms | 0.3 |
| Miss | >140 ms | 0 |

Accuracy is weighted earned judgements divided by resolved judgements plus extra
presses. Each hold contributes a head and tail. At completion every expected
judgement is resolved. Combo advances per successful judgement, resetting on a
miss or extra press. Health starts at 100: Perfect +2, Good +1, Okay 0, Miss -12,
extra press -4, clamped to 0–100. Zero health ends ordinary attempts. No Fail
continues and Autoplay demonstrates the chart; both are always unranked.

Score is `round(1,000,000 * (0.7*C + 0.3*A))`, where C accumulates the square root
of combo after each success, normalized by the uninterrupted maximum. A divides
weighted earned judgments by all expected judgments plus extras, even before
completion. Unplayed notes never award score. The HUD separately shows running
accuracy against resolved judgments and extras.

Escape, focus loss, a hidden document, or suspended audio pauses the attempt.
Resume freezes musical time during a three-second count-in and starts a new audio
source at the saved sample position, preserving calibration, score and health.
Resumed attempts are practice-only. Retry creates fresh scoring and input state,
stops the old source, and schedules the original two-second count-in.

Active holds retain their physical keys across a pause. Resume asks the player to
re-grab all of them before counting in; re-grabbing does not score another head.
Releasing a required key during the count-in cancels back to pause without breaking
the hold. Other pressed keys are released at the pause timestamp so a lost keyup
cannot leave a tap key stuck. Replay and Autoplay do not require physical re-grabs.
Pending audio starts are cancelled on exit/focus loss, including races between
an old context-resume promise and a newer attempt.

## Chart and audio

Chart version 2 contains metadata, audio offset, duration, tempo sections, logical
notes in excerpt-relative milliseconds, and independent lanes. Notes reference
one or more lane IDs. Each lane has position, angle, length, and easing keyframes.
Version 1 charts migrate to one lane without changing any note timestamps.
Validation bounds imported collections, checks nested data, and rejects broken
references before use. Active sessions own a copy of their chart.

Smoothstep or linear interpolation reaches authored destinations at their
timestamps. Lane bounds are constrained during rotations. Tempo conversion and
beat/tuplet snapping work across tempo changes. Reduced-motion effects preserve
authored lane motion. **Freeze line movement** is a separate saved practice assist:
each lane retains its opening position, angle and length, including its feedback
anchors. Note times and scoring rules stay the same, but the run is unranked.

The song study covers 35,401–75,401 ms of the user's 88-second cut. Its SHA-256 is
`f9b17daaff3571bb758ecfe1402a2108f64121aca0e0dc053af49fb6a5b0b33f`.
The file is selected and checked locally, never copied to assets or uploaded.
The beat grid was referenced from the accompanying local map's timing metadata;
notes and movement patterns are original and hand-authored. This is a rhythm
study awaiting musical playtesting, not a finished transcription of the song.

The ten-second introductory chart is preserved. A separate 144 BPM two-hand drill
lasts 64 beats (about 27 seconds): dotted-quarter spacing, eighth-note triplets,
sixteenth bursts, dotted-eighth syncopation, then holds with independent taps.
These and the new 120 BPM, 32-second four-lane **Moving together** study synthesize
original tones directly into an audio buffer, making their exact rhythms audible
without external media. The geometry study rotates a square and introduces shared
taps and holds. No chart editor,
automatic mapping, arbitrary chart import, or chart/audio download is included.

Song arrangement v2 uses repeated triplet/sixteenth motifs, dotted rhythms, short
rolls, recovery gaps, and hold-plus-tap passages. Its audio offset, tempo, duration,
and choreography are unchanged. Fast rolls primarily occur during stable lane
poses; the four-beat glides use simpler responses. Beat fractions are authored in
`data/patterns.ts` (quarter = 1, dotted quarter = 1.5, eighth triplet = 1/3,
sixteenth = 1/4), then converted directly to milliseconds without repeated rounding.
These describe note spacing, not new input types or mandatory key bindings.

At 192 BPM, sixteenths are 78.125 ms apart and eighth-note triplets 104.167 ms
apart. Short bursts encourage alternating hands; a held key plus other-key taps
requires independent inputs, but the game does not identify or enforce hands.
Try F/J, or any comfortable pair. Scoring still consumes the earliest eligible
unjudged head; dense windows overlap, so skipping a note can affect the following
judgement. Timing windows and matching rules have not been changed for this pass.
The song remains an authored beat-grid study requiring musical playtesting, not
a verified transcription of its drums or vocals.

## Clock and rendering

Web Audio schedules playback. `getOutputTimestamp()` maps performance-based input
timestamps to the audio reaching the output device; a latency-adjusted audio-clock
fallback handles unavailable or stale timestamps. This reduces avoidable drift but
cannot remove every keyboard, Bluetooth, or hardware latency. Manual calibration
is still necessary on some devices.

Positive offset subtracts from both judgement and visual chart time: notes reach
the gate later relative to the music. Start at zero; increase it for consistently
late hits. The results show mean signed error for successful judgements only.

Canvas draws with `requestAnimationFrame`, while React's HUD updates at most twenty
times a second. Scoring takes explicit millisecond timestamps rather than frame
counts. Miss timestamps are authored deadlines, not the frame that noticed them.
If a timestamped input arrives after a speculative frame miss, the pure engine
reconciles its input history and emits only changed feedback. This does not replace
real hardware/input latency testing. No Rust IPC calls are made during gameplay. A local file selection is
required again after an application restart; preferences and skin packs are persisted.

## Replay boundary

Replay version 2 records anonymous physical-key IDs, press/release timestamps,
mods, explicit frozen-line/resumed assistance flags, rules version, and a canonical
SHA-256 chart identity. Version 1 was an in-memory development format and is rejected
instead of inventing missing eligibility flags. Replays omit the wall time spent
paused while reproducing the same chart-time judgments. Identity includes
timing, choreography, visual membership and audio identity. Verification requires
the expected hash from the trusted map revision, never from the submitted replay.
The player and verifier use the same pure session rules; backward seeking creates
a fresh session. Invalid ordering, duplicated key transitions, unknown rules and
wrong map identities are rejected. Results can replay the last attempt; Browse
also persists local map results and their input streams for later playback. See
[local records](maps.md#local-records-and-replays). Playback never creates another
attempt, and editor/study demonstrations do not enter map history.

Replay validation is not proof of human play. Online attempt tickets, submission,
server recomputation and suspicious-score moderation are still unimplemented.
The domain eligibility flag only describes completed normal play; it is not an
authorization to publish a ranked score. Guest/offline play remains unranked.

## Skins and feedback

`features/skins/domain/` defines the typed appearance contract and built-in Midnight
and High Contrast dark presets; Rhythm imports them through its skin helpers. It supplies CSS custom properties for all app
colors and Canvas values for notes, target, lane, and feedback, plus synthesized
hit-sound envelopes. Note radii are constrained to 8–10 world units. Skins cannot
change layout, chart coordinates, approach time, timing windows, input, or scoring.
Imported [skin packs](skins.md) can replace individual PNG sprites, WAV hit sounds
and theme colors. No custom CSS/scripts or interface replacements are accepted.
Pack decoding happens before play with per-asset fallback and a local preview.
IndexedDB retains the original pack; quota or unavailable storage permits
session-only use with a notice. Browser downloads and the macOS debug app's native
Save/import/export loop are verified. Windows/Linux native release checks remain.
The approved sprite reference is retained in `assets/gameplay-reference.png`.
Midnight now uses the separately generated `gameplay-atlas-v1.png` with measured
frame bounds and pivots in the adjacent JSON. The atlas is decoded before audio
starts; incorrect dimensions or decode failure retain primitive drawing. The built-in High
Contrast uses its original Canvas art. Line/ribbon middle sections stretch
while their caps retain their proportions. Timing coordinates stay independent
of image frames. See the [asset notes](../src/features/rhythm/assets/README.md).

The scoring session emits ordered judgement events with an increasing ID, optional
note ID, action, grade, and chart timestamp. `drainJudgements()` delivers them once;
the latest feedback remains available to the HUD. `HitFeedback` consumes that stream
for both visuals and sound. It snapshots target position at judgement time rather
than attaching transient effects to the moving line. Unpressed holds retain both
scored endpoint misses, but produce only one visual fade.

Success rings and at most four sparks last 200 ms. Hold presses pulse without
sparks; the target stays lit while held. Release feedback is slightly stronger.
Misses dim/fade the affected geometry, and extra presses show a local warning.
Reduced motion replaces moving feedback with static highlights. Effects are capped
at 32 and sound voices at eight; oldest entries are removed when full. Pause,
retry, exit, completion, and disposal clear feedback and stop sound voices.

Music volume and hit sound volume are independent. Hit sounds default to 15%; zero
mutes them. Only successful presses/releases play short sounds, using preloaded custom
PCM samples when present and synthesis otherwise. There is no continuous hold
or failure audio. The existing preference storage key is retained:
older preferences receive the new defaults, and unknown skin IDs fall back to
Midnight. The local audio file is never persisted.

## Verification checklist

- Run `npm test`: inclusive timing edges, chronological matching, key repeats,
  extra presses, both hold endpoints, other-key taps, retries, complete charts,
  render-rate independence, chart validation, movement bounds, and clock mapping.
- Also cover event ordering/single consumption, missed-hold deduplication, anchored
  overlapping effects, expiry/caps, static reduced-motion feedback, ribbon layering,
  bounded note sizes, sound voice muting/cleanup, preference migration, and scoring
  equivalence between skins.
- Cover overlapping-hold re-grabs, lost tap-key keyups, count-in boundaries,
  assistance eligibility through replay, frozen geometry versus reduced effects,
  calibrated resume offsets and cancelled/concurrent audio starts.
- Run `npm run build` and `npm.cmd run tauri -- build --debug --no-bundle`.
- In a real WebView, load the exact recording, test a rejected file and cancellation,
  play taps and holds, retry repeatedly, lose focus mid-hold, and finish an excerpt.
- Inspect setup, gameplay, and results at narrow and wide sizes; verify keyboard
  focus, offset persistence, reduced effects, and no browser console errors.
- Inspect dense notes, held and broken ribbons, and all lane orientations with both
  skins. Keep gameplay and visual-review screenshots in ignored `.tools/screenshots/`.
- Listen and playtest the actual recording before treating the beat-grid study as
  a polished chart. Test wired and Bluetooth output; do not claim universal timing
  accuracy or cross-platform support based on browser-only checks.

Audio scheduling references: [buffer-source start offsets](https://developer.mozilla.org/en-US/docs/Web/API/AudioBufferSourceNode/start)
and [output-device timestamp mapping](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp).
