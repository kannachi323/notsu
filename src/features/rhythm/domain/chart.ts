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
  return lanePoseInto(lane, timeMs, { x: 0, y: 0, angle: 0, length: 0 });
}

/** Allocation-free variant for the render loop: writes into a reused pose. */
export function lanePoseInto<T extends Pose & { length: number }>(lane: Lane, timeMs: number, out: T): T {
  const frames = lane.motion;
  let a = frames[0], b = frames[0], fraction = 0;
  if (timeMs > frames[0].timeMs) {
    let low = 0, high = frames.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (frames[mid].timeMs <= timeMs) low = mid + 1; else high = mid;
    }
    a = frames[low - 1]; b = frames[low] ?? a;
    fraction = a === b ? 0 : (timeMs - a.timeMs) / (b.timeMs - a.timeMs);
  }
  const t = b.easing === "linear" ? fraction : smooth(fraction);
  out.x = mix(a.x, b.x, t); out.y = mix(a.y, b.y, t); out.angle = mix(a.angle, b.angle, t); out.length = mix(a.length, b.length, t);
  return out;
}
