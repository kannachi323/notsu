import type { TimingPoint } from "./chartTypes";

/** One beat is a quarter note. Sections anchor at their explicit audio timestamp. */
export function beatAtTime(timing: TimingPoint[], timeMs: number): number {
  let beat = 0;
  for (let i = 0; i < timing.length; i++) {
    const point = timing[i], end = timing[i + 1]?.timeMs ?? Infinity;
    if (timeMs <= end) return beat + (timeMs - point.timeMs) * point.bpm / 60_000;
    beat += (end - point.timeMs) * point.bpm / 60_000;
  }
  return beat;
}

export function timeAtBeat(timing: TimingPoint[], beat: number): number {
  let remaining = beat;
  for (let i = 0; i < timing.length; i++) {
    const point = timing[i], end = timing[i + 1]?.timeMs ?? Infinity;
    const count = (end - point.timeMs) * point.bpm / 60_000;
    if (remaining <= count) return point.timeMs + remaining * 60_000 / point.bpm;
    remaining -= count;
  }
  return 0;
}

/** Snap locally to a tempo section, including triplets and custom tuplets. */
export function snapTime(timing: TimingPoint[], timeMs: number, divisor: number): number {
  if (!Number.isInteger(divisor) || divisor < 1 || divisor > 192) throw new Error("Invalid beat divisor.");
  const next = timing.findIndex(point => point.timeMs > timeMs);
  const index = next < 0 ? timing.length - 1 : Math.max(0, next - 1);
  const point = timing[index];
  const step = 60_000 / point.bpm / divisor;
  const snapped = point.timeMs + Math.round((timeMs - point.timeMs) / step) * step;
  return Math.max(0, Math.min(snapped, timing[index + 1]?.timeMs ?? Infinity));
}
