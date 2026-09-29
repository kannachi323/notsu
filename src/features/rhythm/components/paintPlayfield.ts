import { APPROACH_MS, HIT_WINDOW_MS, poseAt } from "../domain/chart";
import { laneAnchor, LANE_LENGTH, REST_POSE, WORLD_HEIGHT, WORLD_WIDTH } from "../domain/layout";
import type { Runtime } from "../useRhythmGame";
import { getSkin } from "./skins";
import { orb, paintEffect, ribbon, ring } from "./orbs";

export function paintPlayfield(ctx: CanvasRenderingContext2D, width: number, height: number, state: Runtime) {
  ctx.clearRect(0, 0, width, height);
  const scale = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT);
  ctx.save();
  ctx.translate((width - WORLD_WIDTH * scale) / 2, (height - WORLD_HEIGHT * scale) / 2);
  ctx.scale(scale, scale);
  const skin = getSkin(state.settings.skinId);
  const preview = state.phase === "setup" || state.phase === "starting";
  const time = preview ? 0 : state.timeMs;
  const chart = state.session.chart;
  const pose = state.settings.reducedMotion || preview ? REST_POSE : poseAt(chart.motion, time);
  const anchor = laneAnchor(pose);
  const position = (at: number) => (at - time) / APPROACH_MS * LANE_LENGTH;

  if (!state.settings.reducedMotion && !preview) {
    const next = chart.motion.find(frame => frame.timeMs > time && frame.timeMs - time < 900);
    if (next && (next.x !== pose.x || next.y !== pose.y || next.angle !== pose.angle)) {
      const target = laneAnchor(next);
      ctx.globalAlpha = .45; ctx.strokeStyle = skin.lane.hint; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(target.x - 5, target.y); ctx.lineTo(target.x + 5, target.y);
      ctx.moveTo(target.x, target.y - 5); ctx.lineTo(target.x, target.y + 5); ctx.stroke(); ctx.globalAlpha = 1;
    }
  }

  // Failed ribbons also stay beneath every live tap.
  for (const effect of state.feedback.effects) if (effect.failed) paintEffect(ctx, effect, time, skin);
  ctx.save(); ctx.translate(anchor.x, anchor.y); ctx.rotate(anchor.radians);
  ctx.strokeStyle = skin.lane.color; ctx.lineWidth = skin.lane.width;
  ctx.beginPath(); ctx.moveTo(-24, 0); ctx.lineTo(LANE_LENGTH, 0);
  ctx.moveTo(LANE_LENGTH, -4); ctx.lineTo(LANE_LENGTH, 4); ctx.stroke();

  const visible = state.session.states.filter(({ note, head, tail }) => {
    if (head === "Miss" || position(note.timeMs) > LANE_LENGTH) return false;
    return note.kind === "tap" ? !head && position(note.timeMs) >= -LANE_LENGTH * HIT_WINDOW_MS / APPROACH_MS : !tail;
  });
  let holding = false;
  if (preview) {
    ribbon(ctx, 222, 310, skin);
    orb(ctx, 222, skin.note.hold, skin); orb(ctx, 310, skin.note.hold, skin, true);
    for (const x of [90, 154, 360]) orb(ctx, x, skin.note.tap, skin);
  } else {
    // All ribbons first, then endpoints, then taps: taps cannot disappear beneath a hold.
    for (const { note, head } of visible) {
      if (note.kind !== "hold") continue;
      holding ||= !!head;
      ribbon(ctx, head ? 0 : position(note.timeMs), Math.min(LANE_LENGTH, position(note.endMs)), skin);
    }
    for (const { note, head } of visible) {
      if (note.kind !== "hold") continue;
      orb(ctx, head ? 0 : position(note.timeMs), skin.note.hold, skin);
      if (position(note.endMs) <= LANE_LENGTH) orb(ctx, position(note.endMs), skin.note.hold, skin, true);
    }
    for (const { note } of visible) if (note.kind === "tap") orb(ctx, position(note.timeMs), skin.note.tap, skin);
  }
  ring(ctx, 0, 0, skin.target.radius, holding ? skin.note.hold : skin.target.color, skin.target.width);
  ctx.restore();
  // Snapshot anchors are world-space positions, independent of subsequent lane motion.
  for (const effect of state.feedback.effects) if (!effect.failed) paintEffect(ctx, effect, time, skin);
  ctx.restore();
}
