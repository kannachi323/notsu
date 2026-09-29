# Gameplay art reference

`gameplay-reference.png` is the user-approved cyan/violet orb, line and geometric
formation sprite concept supplied September 29, 2026. The generation brief is
retained in `gameplay-sprites-v1.prompt.txt`.

This reference is not a runtime atlas. It has no measured sprite bounds, pivots or
animation metadata. The renderer uses the separately measured atlas described
below, whose alpha edges and fallbacks have been checked at gameplay sizes.

Formation pictures illustrate combinations of independent lane primitives; they
must not become baked images that determine note timing or line geometry.

## Built-in runtime atlas

`gameplay-atlas-v1.png` is a new image generated with the built-in imagegen tool,
using that reference for style. The exact generation prompt is saved in
`gameplay-atlas-v1.prompt.txt`. The generated pixels and alpha are preserved.

`gameplay-atlas-v1.json` measures all twelve sprites in the 1448×1086 image. Each
frame specifies its source rectangle, visible-body size and pixel pivot. Logical
note centres map to the measured pivots; line and ribbon end caps retain their
aspect ratio while only the middle stretches. The frame measurements use the
alpha≥128 silhouette for the body/pivot and alpha≥8 bounds plus two pixels for
the sampling rectangle. Very faint alpha=1 residue in empty ring centres was
inspected against the actual dark stage and is not visibly intrusive there.

The Midnight renderer uses these textures for notes, targets, lines, ribbons and
hit feedback. High Contrast keeps its more pronounced Canvas primitives, and
missing or failed image decoding falls back to those original drawing routines.
Startup checks decoded dimensions. Tests bind metadata to PNG dimensions and
check frame bounds, pivots, cap geometry and fallback behavior.

Hit rings animate through the existing bounded scale/fade envelopes (200 ms by
default); they do not contain timing or game logic. Imported skin packs, alternate
texture/sound loading and cross-platform visual/audio review are still pending.
