# Skin packs

Open **Play → Settings → Appearance** to select Midnight, High Contrast, or an
imported skin. The preview uses the gameplay renderer. **Hear tap** and **Hear
release** use the current hit sound volume, including mute. Import a `.notsuskin`
or `.zip` file; the pack stays on this device in browser/WebView storage. No skin
is uploaded. Imports are available for the session if storage is blocked or full,
with a visible notice. Removing a pack offers Undo while this settings screen stays
open. Export your pack before clearing application data.

Choose **Download starter** for a ZIP containing the original gameplay atlas,
measured frames, two original PCM sound files, and an editable `skin.json`.
Unzip, edit, then ZIP the contents with `skin.json` directly at the archive root.
Rename the ZIP to `.notsuskin` if desired. **Export skin** requests a download of
the selected imported pack's original bytes. Desktop builds instead show **Save
starter** and a native Save dialog. Cancelling leaves your skin unchanged. A save
is confirmed only after writing succeeds. Browser downloads and the macOS debug
Save/import/export loop are verified; Windows/Linux native release checks remain.

## Manifest version 1

A minimal color pack needs only `skin.json`:

```json
{
  "format": "notsu-skin",
  "version": 1,
  "name": "My skin",
  "author": "Your name",
  "base": "high-contrast",
  "gameplay": { "tap": "#ffffff", "hold": "#bdabff" }
}
```

`base` is `midnight` or `high-contrast`. Omitted assets inherit that base. Midnight
uses the bundled atlas; High Contrast uses drawn shapes. Gameplay colors affect
those shapes and supplemental effects, not the pixels of an imported/bundled PNG.
To recolor atlas notes, edit their artwork. Name and author are plain text, up to
80 characters. The application generates the pack ID from its archive SHA-256;
it cannot replace a built-in ID. Identical bytes reimport as the same skin.
Repacking with different ZIP metadata may create a separate skin.

Optional `theme` keys: `background`, `surface`, `text`, `muted`, `border`,
`accent`, `hold`, `focus`, `on-accent`, `warning`, `error-surface`, `overlay`.
Colors are `#RRGGBB`; overlay also accepts `#RRGGBBAA`. Invalid colors fall back.
Themes fall back to the base if text/muted contrast against background or surface,
on-accent contrast, or focus contrast is insufficient. This check does not replace
visual review of all interface states.

Optional `gameplay` colors: `tap`, `hold`, `lane`, `target`, `highlight`, `shade`,
`warning`. The format does not accept CSS, scripts, URLs, geometry rules, input
bindings, hit windows, scores, or replacements for the interface. Unknown fields
are rejected instead of silently accepting future or misspelled rules.

## Texture frames

Optional `sprites` keys are `tap`, `holdHead`, `holdTail`, `miss`, `target`,
`targetTap`, `targetHold`, `warning`, `lane`, `ribbon`, `hitTap`, `hitHold`.
Each value identifies one PNG frame:

```json
{
  "file": "notes.png",
  "x": 0, "y": 0, "width": 100, "height": 100,
  "pivotX": 50, "pivotY": 50,
  "bodyWidth": 100, "bodyHeight": 100
}
```

Rectangles and body dimensions use integer pixels; pivots may use fractional
pixels relative to the frame. The visible body is centred on the pivot and must
fit inside the frame. Keep transparent padding small: body width must be at least
85% of the frame width and body height at least 75% of its height. Round sprites
must have approximately equal body dimensions (within 10%). Lane/ribbon frames
must be horizontal, with body width greater than height; the renderer preserves
end caps and stretches the middle. These measured bounds align the art with the
existing logical timing position and scale it to the base skin's display size.

Use static PNGs up to 2048×2048, 8 MB each, with at most 8,388,608 decoded pixels
across referenced images. Frames outside an image, unreadable images, invalid
pivots, and empty/nearly transparent sprites fall back independently. Hit effect
animation remains controlled by gameplay and respects reduced motion. Inspect
custom art on both a quiet preview and a dense chart before sharing it.

## Hit sounds

Optional `sounds` maps `tap` and `release` to local WAV paths. Use uncompressed
PCM, mono or stereo, 16 or 24 bit, 8–96 kHz, at most one second and 400 KB each.
Tap is also used for a hold head. Shared visual notes play one logical sound.
Sounds are decoded before the attempt, peak-normalized to at most 0.25 with a
maximum 4× boost, and given a short boundary fade. Missing, silent or invalid
files fall back to the base synthesized sound. Eight concurrent voices maximum;
pause, exit and preview teardown disconnect them.

## Archive and storage limits

- ZIP stored/deflate, up to 16 MB archived and 24 MB expanded, at most 32 files.
- Root `skin.json` up to 64 KB, plus PNG/WAV files; no other file types or directory
  entries. Do not include platform metadata folders in the ZIP.
- Relative ASCII paths (letters, digits, `_`, `-`, `.`, `/`), up to 120 characters.
  No absolute paths, empty path segments, traversal, URLs or duplicate names,
  including names differing only in case. Use lowercase `.png` and `.wav` suffixes.
- Imports validate headers, actual expanded sizes and CRC checksums in a worker
  with a timeout. Nothing is extracted to the filesystem or executed.
- Up to 20 installed packs and 128 MB of archived packs per catalog. Decoded
  textures/sounds are cached for two packs. Original ZIPs are retained for export.
- Reopening storage reparses the archive and verifies its identity. Corrupt saved
  packs are skipped with a notice; the built-in skin remains available. Browser
  storage can be cleared or evicted by the platform, so retain your source files.

The importer cannot determine ownership of artwork/audio. Only distribute media
you are allowed to share. Community skin sharing is not implemented in this slice.
