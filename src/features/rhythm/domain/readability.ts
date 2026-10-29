import { APPROACH_MS, lanePoseAt } from "./chart";
import type { Chart, Lane } from "./chartTypes";
import { laneAnchor } from "./layout";

/**
 * Sightreading limits. A line may move freely while it is empty, but while a
 * note approaches or is held on it, its target and direction must change
 * slowly enough that the distance-to-target timing cue stays readable.
 */
export const READABLE_TURN_DEG_PER_S = 120;
export const READABLE_TARGET_PX_PER_S = 160;

export type MotionIssue = { laneId: string; kind: "turn" | "target"; startMs: number; endMs: number; peak: number };

/** Times when each lane carries a visible note: from its approach until its hit or hold release. */
function occupied(chart: Chart, lane: Lane): [number, number][] {
  const spans = chart.notes.filter(note => note.laneIds.includes(lane.id))
    .map(note => [Math.max(0, note.timeMs - APPROACH_MS), note.kind === "hold" ? note.endMs : note.timeMs] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const span of spans) {
    const last = merged.at(-1);
    if (last && span[0] <= last[1]) last[1] = Math.max(last[1], span[1]); else merged.push([...span]);
  }
  return merged;
}

/** Report each stretch where an occupied lane turns or moves its target faster than the readable limits. */
export function motionIssues(chart: Chart, stepMs = 20): MotionIssue[] {
  const issues: MotionIssue[] = [];
  for (const lane of chart.lanes) {
    const open: Partial<Record<MotionIssue["kind"], MotionIssue>> = {};
    const close = (kind: MotionIssue["kind"]) => { const issue = open[kind]; if (issue) { issues.push(issue); delete open[kind]; } };
    for (const [from, to] of occupied(chart, lane)) {
      for (let time = from; time < to; time += stepMs) {
        const a = lanePoseAt(lane, time), b = lanePoseAt(lane, time + stepMs);
        const start = laneAnchor(a, a.length), end = laneAnchor(b, b.length);
        const speeds = {
          turn: Math.abs(b.angle - a.angle) / stepMs * 1000,
          target: Math.hypot(end.x - start.x, end.y - start.y) / stepMs * 1000,
        };
        for (const kind of ["turn", "target"] as const) {
          const limit = kind === "turn" ? READABLE_TURN_DEG_PER_S : READABLE_TARGET_PX_PER_S;
          if (speeds[kind] <= limit) { close(kind); continue; }
          const issue = open[kind] ??= { laneId: lane.id, kind, startMs: time, endMs: time, peak: 0 };
          issue.endMs = time + stepMs; issue.peak = Math.max(issue.peak, Math.round(speeds[kind]));
        }
      }
      close("turn"); close("target");
    }
  }
  return issues.sort((a, b) => a.startMs - b.startMs);
}
