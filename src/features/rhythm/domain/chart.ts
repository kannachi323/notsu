import type { Lane, MotionKeyframe, Pose } from "./chartTypes";
export type { Chart, ChartSource, ChartNote, LegacyChart, Note, Pose, MotionKeyframe, Lane, LaneKeyframe, TimingPoint } from "./chartTypes";
export { APPROACH_MS, HIT_WINDOW_MS } from "./rules";
export { validateChart, loadChart } from "./chartValidation";

function segment<T extends MotionKeyframe>(frames: T[], timeMs: number): [T, T, number] {
  if (timeMs <= frames[0].timeMs) return [frames[0], frames[0], 0];
  let low = 0, high = frames.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (frames[mid].timeMs <= timeMs) low = mid + 1; else high = mid;
  }
  const a = frames[low - 1], b = frames[low] ?? a;
  return [a, b, a === b ? 0 : (timeMs - a.timeMs) / (b.timeMs - a.timeMs)];
}
const smooth = (fraction: number) => fraction * fraction * (3 - 2 * fraction);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const poseBetween = (a: Pose, b: Pose, t: number): Pose => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), angle: mix(a.angle, b.angle, t) });

export function poseAt(frames: MotionKeyframe[], timeMs: number): Pose {
  const [a, b, fraction] = segment(frames, timeMs);
  return poseBetween(a, b, smooth(fraction));
}

export function lanePoseAt(lane: Lane, timeMs: number): Pose & { length: number } {
  const [a, b, fraction] = segment(lane.motion, timeMs);
  const t = b.easing === "linear" ? fraction : smooth(fraction);
  return { ...poseBetween(a, b, t), length: mix(a.length, b.length, t) };
}
