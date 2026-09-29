# Local map editor

Open **Editor** from Home. This first creator slice supports local MP3/WAV songs,
waveform navigation, manual taps/holds/shared hits, tempo sections, independently
moving lines, geometric presets, undo/redo, autosave, recovery and engine playtests.
The creator milestone remains in progress; this is not the finished publishing UI.

## Authoring

1. Choose a mono/stereo recording. The original bytes stay on this device. Limits:
   100 MB compressed, 1 second–30 minutes, and 512 MB decoded PCM. Metadata is
   checked before full decoding. SHA-256 binds the draft to its exact recording.
2. Set song/artist/mapper/difficulty details. Set BPM at the playhead; the initial
   tempo is anchored at zero. Adding/removing tempo changes alters the grid, not
   already-authored note times. Beat divisors include triplets and smaller tuplets.
3. Click the waveform to seek, use the song slider, or type milliseconds. **Snap
   playhead** aligns the cursor. Double-click a line track to add a tap, or use
   the labeled note controls. Select several lines to create one shared hit.
   A shared hold has one head and one tail regardless of visual instance count.
4. Add independent lines, or triangle/square/hexagon/radial arrangements. **Arrange
   selected** requires the preset's line count and writes destination keyframes
   at the playhead. Earlier frames determine the transition. Line fields set one
   pose; group transforms rotate/scale around the playfield center and translate
   by a percentage of its dimensions. Removing a line removes only its instances.
   Undo restores the complete edit, including orphaned notes.
5. **Listen** plays from the cursor against the audio clock. Editing pauses it.
   **Playtest** uses the actual gameplay renderer, session, scoring and replay
   path, with No Fail or Autoplay. These runs are unranked; playtests use authored
   motion even when the player's frozen-line practice setting is enabled.

## Listening and count-in

Enable **Metronome** for quarter-note clicks that follow each explicit tempo anchor.
A higher click marks the start of a tempo section; no time signature is implied.
Choose **2 beats** or **4 beats** for an audible count-in before Listen starts the
song. Count-in uses the tempo at the selected cursor, even when the cursor is off
the grid or the metronome is off. The playhead stays fixed through count-in.
Afterward, clicks follow the actual song grid rather than an off-grid cursor.

**Playback sound** has separate song and click volume controls. Song volume starts
from the player's saved music preference. These editor controls are session-only
and do not modify charts. Volume and metronome changes work while listening;
changing count-in pauses playback. Pause, seek, edit, hidden-page events and leaving
the editor cancel the song and queued clicks together. Listen at the song end
restarts from zero, and the timeline keeps its final populated page visible.

The song and original synthesized clicks share a Web Audio context. A 25 ms timer
schedules up to 150 ms ahead using the context clock; React frames only update the
view. The heard-time estimate accounts for output timestamps/latency. Each start
has a 60 ms scheduling lead. Stalled callbacks skip overdue beats instead of playing
them in a burst. A bounded click queue rejects pathological tempo-change density
with an actionable error; the song remains usable with the metronome off.

Scheduling tests are separate from perceptual sound and physical audio-latency
validation, which still require listening and target-device playtests.

## Selecting and retiming circles

Click a timeline head to select its logical circle, or use the labeled checkboxes
beside the circle list. Shift-click adds/removes circles. The Selection panel also
selects all circles or an inclusive range of start times across every line.
Shared instances always move and score together.

Drag a head to move the selection by milliseconds with that head snapped to the
current grid. Drag a hollow hold endpoint to resize only that hold. A white outline
marks selected circles; a preview shows the proposed drag. Releasing commits one
undo step; Escape or pointer cancellation abandons it. Keyboard-accessible controls
provide the same retiming operations without dragging.

**Earlier/Later** moves the selection by beats or exact milliseconds. Beat moves
transform both starts and ends through the tempo map; millisecond moves preserve
elapsed durations. **Snap selection** snaps each start/end locally to its tempo
section and the chosen divisor. The single-circle inspector preserves typed times,
converts taps/holds, and edits shared lines. **Use selected lines** replaces the
line instances of the entire selection.

**Copy phrase** stores relative beat offsets and shared lines in the current editor
view. **Paste at playhead** anchors its first circle to the grid and follows the
destination tempo, with new circle identities. It is an in-app clipboard, cleared
when changing drafts or leaving the editor view. Removing a referenced line requires
recopying the phrase. Timing collisions, collapsed holds, missing lines and song
bounds fail atomically; retiming never silently merges distinct scored circles.
Delete, paste, reassignment and batch timing edits are individually undoable.

## Movement easing

**Arrival easing** controls the transition into a destination keyframe: Smooth
slows at both ends; Linear advances at a constant rate. New line/group/preset
keyframes use this choice. The default preserves existing easing or uses Smooth
for a new frame. **Apply easing here** changes only the easing of existing frames
on all selected lines; it preserves their positions, lengths and angles. Every
selected line must have a keyframe at the playhead. The panel identifies mixed
easing in selected groups. The first frame has no incoming movement.

The stage and waveform use Canvas. All authoring actions also have labeled form
controls. Narrow windows reflow and scroll; editing controls stay accessible while
scrolling. The editor follows the approved dark cyan/violet gameplay direction.

## Persistence and recovery

IndexedDB database `notsu-editor` stores drafts and original song Blobs separately.
Songs deduplicate by hash; edits only rewrite the chart. Creation is transactional.
Autosave coalesces changes and serializes writes; a revision check rejects stale
writes from another window. The UI reports success only after transaction commit.
Limits are 50 drafts, 512 MB of original songs and 4 MB per serialized document.
Undo history retains at most 100 snapshots and 8 million characters per stack.
History is session-only; the current document and song survive restart.

If initial storage fails, the draft remains usable for this session with a visible
notice. Later failures preserve the last saved draft and the current in-memory
edits. Navigation/reload guards prevent silent loss while work is unsaved.
**Back up draft** exposes a chart-only JSON backup. Browser builds provide a real
download link; the native app currently provides selectable backup text. Keep the
original song separately. **Restore a draft backup** validates the pasted JSON and
requires a recording with the same hash, then creates a new draft identity.

**Prepare map package** produces a complete `.notsumap` archive with the original
recording. Save it through a native dialog or browser download link, or add it
directly to the local library. **Create another difficulty** copies the current
saved chart under a new difficulty ID in the same set. Give each difficulty a
unique name; package export can include all other saved difficulties in that set.
The current in-memory difficulty is included even when autosave is unavailable.

**Import a complete map package** restores every difficulty and its song in one
transaction, preserving map-set/chart identities and timing. Existing draft IDs
cause a clear conflict instead of overwriting local work. Old JSON drafts without
a set ID use their document ID as the initial set. See [package format](maps.md).
Draft deletion and conflict-resolution UX remain pending.

## Verification and remaining work

Domain tests cover empty drafts versus strict playable charts, logical shared
hits/holds, tempo snapping, closed preset geometry, timed transforms, deletion and
bounded atomic undo/redo. Adapter tests cover exact song identity, metadata limits,
stereo waveform peaks, save/reopen, stale-window conflicts, failed writes, timeout
cleanup and serialized/coalesced autosaves. See the current counts and actual
browser/native evidence in [public-beta delivery](public-beta.md).

Still required for the creator milestone: richer difficulty/draft
management, recovery UX, performance with large real maps, platform/browser verification and mapper
playtests. Publishing, online browsing and moderation remain separate pending work.

Implementation references: [Web Audio decoding](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/decodeAudioData),
[channel data](https://developer.mozilla.org/en-US/docs/Web/API/AudioBuffer/getChannelData),
[IndexedDB transactions](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction),
and [navigation blocking](https://reactrouter.com/api/hooks/useBlocker).
Playback scheduling references: [scheduled source start](https://developer.mozilla.org/en-US/docs/Web/API/AudioScheduledSourceNode/start),
[context time](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/currentTime),
and [output timestamps](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/getOutputTimestamp).
