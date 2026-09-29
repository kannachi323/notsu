import type { Pose } from "./chart";

export const WORLD_WIDTH = 800;
export const WORLD_HEIGHT = 520;
export const LANE_LENGTH = 420;
export const REST_POSE: Pose = { x: .28, y: .52, angle: 0 };

/** Keep both ends readable even while interpolating between differently angled poses. */
export function laneAnchor(pose: Pose): { x: number; y: number; radians: number } {
  const radians = pose.angle * Math.PI / 180;
  const dx = Math.cos(radians) * LANE_LENGTH, dy = Math.sin(radians) * LANE_LENGTH;
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
  const margin = 42;
  return {
    x: clamp(pose.x * WORLD_WIDTH, margin - Math.min(0, dx), WORLD_WIDTH - margin - Math.max(0, dx)),
    y: clamp(pose.y * WORLD_HEIGHT, margin - Math.min(0, dy), WORLD_HEIGHT - margin - Math.max(0, dy)),
    radians,
  };
}
