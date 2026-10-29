/** Tap-along calibration. Each tap is matched to its nearest click; the
 * suggested offset is the median error, so a few stray taps do not skew it.
 * Positive means the player hears or taps late, matching Settings.offsetMs. */
export const CALIBRATION_MIN_TAPS = 8;
export const OFFSET_LIMIT_MS = 250;

export function calibrationOffset(taps: readonly number[], clicks: readonly number[], intervalMs: number): number | null {
  if (!clicks.length) return null;
  const errors: number[] = [];
  for (const tap of taps) {
    let nearest = clicks[0];
    for (const click of clicks) if (Math.abs(tap - click) < Math.abs(tap - nearest)) nearest = click;
    // Taps nearer the midpoint than a click are guesses, not timing.
    if (Math.abs(tap - nearest) <= intervalMs * .4) errors.push(tap - nearest);
  }
  if (errors.length < CALIBRATION_MIN_TAPS) return null;
  errors.sort((a, b) => a - b);
  const middle = errors.length >> 1;
  const median = errors.length % 2 ? errors[middle] : (errors[middle - 1] + errors[middle]) / 2;
  // Settings move in 5 ms steps within the supported range.
  return Math.max(-OFFSET_LIMIT_MS, Math.min(OFFSET_LIMIT_MS, Math.round(median / 5) * 5));
}
