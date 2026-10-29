import type { Pose } from "./chart";

export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 520;
export const LANE_LENGTH = 420;
export const REST_POSE: Pose = { x: .28, y: .52, angle: 0 };

/** Keep both ends readable even while interpolating between differently angled poses. */
export type Anchor = { x: number; y: number; radians: number };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

/** Keep both ends readable even while interpolating between differently angled poses.
 * The render loop passes `out` to reuse one anchor object per lane. */
export function laneAnchor(pose: Pose, length = LANE_LENGTH, out: Anchor = { x: 0, y: 0, radians: 0 }): Anchor {
  const radians = pose.angle * Math.PI / 180;
  const dx = Math.cos(radians) * length, dy = Math.sin(radians) * length;
  const margin = 42;
  out.x = clamp(pose.x * WORLD_WIDTH, margin - Math.min(0, dx), WORLD_WIDTH - margin - Math.max(0, dx));
  out.y = clamp(pose.y * WORLD_HEIGHT, margin - Math.min(0, dy), WORLD_HEIGHT - margin - Math.max(0, dy));
  out.radians = radians;
  return out;
}
