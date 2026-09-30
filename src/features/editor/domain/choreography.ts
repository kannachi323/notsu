import { lanePoseAt } from "../../rhythm/domain/chart";
import type { Lane, LaneKeyframe } from "../../rhythm/domain/chart";
import { WORLD_HEIGHT, WORLD_WIDTH } from "../../rhythm/domain/layout";

export type GeometryPreset = "triangle" | "square" | "hexagon" | "radial";
export const presetCounts: Record<GeometryPreset, number> = { triangle: 3, square: 4, hexagon: 6, radial: 6 };

/** Polygon edges are independent straight lanes, with no note transfer at corners. */
export function presetFrames(kind: GeometryPreset, timeMs: number): LaneKeyframe[] {
  const count = presetCounts[kind], radius = 140;
  const start = kind === "square" ? -3 * Math.PI / 4 : -Math.PI / 2;
  const points = Array.from({ length: count }, (_, i) => ({ x: WORLD_WIDTH / 2 + radius * Math.cos(start + i * 2 * Math.PI / count),
    y: WORLD_HEIGHT / 2 + radius * Math.sin(start + i * 2 * Math.PI / count) }));
  return points.map((point, i) => {
    if (kind === "radial") return { timeMs, x: .5, y: .5, angle: i * 360 / count, length: 180, easing: "smooth" };
    const next = points[(i + 1) % count], dx = next.x - point.x, dy = next.y - point.y;
    return { timeMs, x: point.x / WORLD_WIDTH, y: point.y / WORLD_HEIGHT, angle: Math.atan2(dy, dx) * 180 / Math.PI,
      length: Math.hypot(dx, dy), easing: "smooth" };
  });
}

export function transformedFrames(lanes: Lane[], timeMs: number, transform: { dx: number; dy: number; rotation: number; scale: number }): LaneKeyframe[] {
  const { dx, dy, rotation, scale } = transform;
  if (![dx, dy, rotation, scale].every(Number.isFinite) || scale <= 0) throw new Error("Enter a finite movement and a positive scale.");
  const angle = rotation * Math.PI / 180, cos = Math.cos(angle), sin = Math.sin(angle);
  return lanes.map(lane => {
    const pose = lanePoseAt(lane, timeMs), x = (pose.x - .5) * WORLD_WIDTH, y = (pose.y - .5) * WORLD_HEIGHT;
    return { timeMs, x: .5 + dx + scale * (x * cos - y * sin) / WORLD_WIDTH,
      y: .5 + dy + scale * (x * sin + y * cos) / WORLD_HEIGHT, angle: pose.angle + rotation, length: pose.length * scale, easing: "smooth" };
  });
}
