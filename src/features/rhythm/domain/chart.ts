export type Note =
  | { id: string; kind: "tap"; timeMs: number }
  | { id: string; kind: "hold"; timeMs: number; endMs: number };

export type Pose = { x: number; y: number; angle: number };
export type MotionKeyframe = Pose & { timeMs: number };

export interface Chart {
  version: 1;
  id: string;
  title: string;
  artist: string;
  bpm: number;
  durationMs: number;
  audioOffsetMs: number;
  audioSha256?: string;
  notes: Note[];
  motion: MotionKeyframe[];
}

export const APPROACH_MS = 1500;
export const HIT_WINDOW_MS = 140;

export function validateChart(chart: Chart): void {
  const finite = (n: number) => Number.isFinite(n);
  if (chart.version !== 1 || !finite(chart.durationMs) || chart.durationMs <= 0 ||
      !finite(chart.bpm) || chart.bpm <= 0 || !finite(chart.audioOffsetMs) || chart.audioOffsetMs < 0) {
    throw new Error("Invalid chart timing metadata.");
  }
  if (!chart.notes.length) throw new Error("A chart needs notes.");
  const ids = new Set<string>();
  let previous = -Infinity;
  let holdEnd = -Infinity;
  for (const note of chart.notes) {
    if (ids.has(note.id) || !note.id || !finite(note.timeMs) || note.timeMs < 0 ||
        note.timeMs <= previous || note.timeMs + HIT_WINDOW_MS > chart.durationMs) {
      throw new Error("Notes must have unique IDs and strictly increasing, in-range times.");
    }
    if (note.kind === "hold") {
      if (!finite(note.endMs) || note.endMs <= note.timeMs ||
          note.endMs + HIT_WINDOW_MS > chart.durationMs || note.timeMs <= holdEnd + HIT_WINDOW_MS) {
        throw new Error("Holds must not overlap, including their release window.");
      }
      holdEnd = note.endMs;
    }
    ids.add(note.id);
    previous = note.timeMs;
  }
  if (!chart.motion.length || chart.motion[0].timeMs !== 0) {
    throw new Error("Motion must start at time zero.");
  }
  previous = -Infinity;
  for (const frame of chart.motion) {
    if (![frame.x, frame.y, frame.angle, frame.timeMs].every(finite) ||
        frame.x < 0 || frame.x > 1 || frame.y < 0 || frame.y > 1 ||
        frame.timeMs <= previous || frame.timeMs > chart.durationMs) {
      throw new Error("Invalid movement keyframe.");
    }
    previous = frame.timeMs;
  }
}

export function poseAt(frames: MotionKeyframe[], timeMs: number): Pose {
  if (timeMs <= frames[0].timeMs) return frames[0];
  const next = frames.findIndex(frame => frame.timeMs > timeMs);
  if (next < 0) return frames[frames.length - 1];
  const a = frames[next - 1], b = frames[next];
  const fraction = (timeMs - a.timeMs) / (b.timeMs - a.timeMs);
  const eased = fraction * fraction * (3 - 2 * fraction);
  return {
    x: a.x + (b.x - a.x) * eased,
    y: a.y + (b.y - a.y) * eased,
    angle: a.angle + (b.angle - a.angle) * eased,
  };
}
