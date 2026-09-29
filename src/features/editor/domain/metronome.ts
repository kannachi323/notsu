import type { TimingPoint } from "../../rhythm/domain/chart";

function sectionAt(timing: TimingPoint[], timeMs: number) {
  let low = 0, high = timing.length;
  while (low < high) { const mid = (low + high) >>> 1; if (timing[mid].timeMs <= timeMs) low = mid + 1; else high = mid; }
  return Math.max(0, low - 1);
}

/** Quarter-note clicks follow each explicit tempo anchor, just like the editor grid. */
export function beatsInRange(timing: TimingPoint[], fromMs: number, toMs: number): { timeMs: number; accent: boolean }[] {
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || toMs < fromMs) throw new Error("Invalid metronome interval.");
  const beats: { timeMs: number; accent: boolean }[] = [];
  for (let i = sectionAt(timing, fromMs); i < timing.length && timing[i].timeMs < toMs; i++) {
    const point = timing[i], step = 60000 / point.bpm, end = Math.min(toMs, timing[i + 1]?.timeMs ?? toMs);
    let index = Math.max(0, Math.floor((fromMs - point.timeMs) / step));
    while (point.timeMs + index * step < fromMs) index++;
    for (let time = point.timeMs + index * step; time < end; time = point.timeMs + ++index * step) {
      if (beats.length >= 32) throw new Error("Tempo changes are too dense for the metronome. Simplify them or turn the metronome off.");
      beats.push({ timeMs: time, accent: index === 0 });
    }
  }
  return beats;
}

/** Count in at the cursor's tempo, ending exactly at the chosen playback position. */
export function countInPlan(timing: TimingPoint[], fromMs: number, beats: number) {
  if (!Number.isFinite(fromMs) || fromMs < 0 || ![0, 2, 4].includes(beats)) throw new Error("Choose a valid position and a count-in of zero, two or four beats.");
  const beatMs = 60000 / timing[sectionAt(timing, fromMs)].bpm, durationMs = beats * beatMs;
  return { beatMs, durationMs, clicks: Array.from({ length: beats }, (_, i) => fromMs - durationMs + i * beatMs) };
}
