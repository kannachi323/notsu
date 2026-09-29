import { APPROACH_MS, lanePoseAt } from "../domain/chart";
import { laneAnchor, WORLD_HEIGHT, WORLD_WIDTH } from "../domain/layout";
import type { Runtime } from "../useRhythmGame";
import { getSkin } from "./skins";
import { orb, paintEffect, ribbon, target } from "./orbs";
import { barSprite } from "./sprites";

export function paintPlayfield(ctx: CanvasRenderingContext2D, width: number, height: number, state: Runtime) {
  ctx.clearRect(0, 0, width, height);
  const scale = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT);
  ctx.save();
  ctx.translate((width - WORLD_WIDTH * scale) / 2, (height - WORLD_HEIGHT * scale) / 2);
  ctx.scale(scale, scale);
  const skin = getSkin(state.settings.skinId);
  const preview = state.phase === "setup" || state.phase === "starting";
  const time = preview ? Math.max(0, state.session.chart.notes[0].timeMs - APPROACH_MS * .8) : state.timeMs;
  const visible = state.session.visibleStates(time);
  const lanes = state.session.chart.lanes.map(lane => {
    const pose = lanePoseAt(lane, state.session.assists.freezeMotion ? 0 : Math.max(0, time));
    return { lane, pose, anchor: laneAnchor(pose, pose.length),
      notes: visible.filter(({ note }) => note.laneIds.includes(lane.id)) };
  });
  type View = typeof lanes[number];
  const local = (view: View, draw: (position: (at: number) => number) => void) => {
    ctx.save(); ctx.translate(view.anchor.x, view.anchor.y); ctx.rotate(view.anchor.radians);
    draw(at => (at - time) / APPROACH_MS * view.pose.length);
    ctx.restore();
  };

  // Base lanes first; no later line can obscure a note on a different lane.
  for (const view of lanes) {
    local(view, () => {
      ctx.strokeStyle = skin.lane.color; ctx.lineWidth = skin.lane.width;
      ctx.beginPath();
      if (!barSprite(ctx, skin, "lane", -24, view.pose.length, skin.lane.width)) { ctx.moveTo(-24, 0); ctx.lineTo(view.pose.length, 0); }
      ctx.moveTo(view.pose.length, -4); ctx.lineTo(view.pose.length, 4); ctx.stroke();
    });
    if (!state.settings.reducedMotion && !state.session.assists.freezeMotion && !preview) {
      const next = view.lane.motion.find(frame => frame.timeMs > time && frame.timeMs - time < 900);
      if (next && (next.x !== view.pose.x || next.y !== view.pose.y || next.angle !== view.pose.angle)) {
        const target = laneAnchor(next, next.length);
        ctx.globalAlpha = .45; ctx.strokeStyle = skin.lane.hint; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(target.x - 5, target.y); ctx.lineTo(target.x + 5, target.y);
        ctx.moveTo(target.x, target.y - 5); ctx.lineTo(target.x, target.y + 5); ctx.stroke(); ctx.globalAlpha = 1;
      }
    }
  }
  for (const effect of state.feedback.effects) if (effect.failed) paintEffect(ctx, effect, time, skin);
  for (const view of lanes) local(view, position => {
    for (const { note, head } of view.notes) if (note.kind === "hold") {
      ribbon(ctx, head ? 0 : position(note.timeMs), Math.min(view.pose.length, position(note.endMs)), skin);
    }
  });
  for (const view of lanes) local(view, position => {
    for (const { note, head } of view.notes) if (note.kind === "hold") {
      orb(ctx, head ? 0 : position(note.timeMs), skin.note.hold, skin);
      if (position(note.endMs) <= view.pose.length) orb(ctx, position(note.endMs), skin.note.hold, skin, true);
    }
  });
  for (const view of lanes) local(view, position => {
    for (const { note } of view.notes) if (note.kind === "tap") orb(ctx, position(note.timeMs), skin.note.tap, skin);
  });
  for (const view of lanes) local(view, () => {
    const holding = view.notes.some(({ note, head, tail }) => note.kind === "hold" && head && !tail);
    target(ctx, skin, !!holding);
  });
  // Successful effects retain their judgement-time world positions.
  for (const effect of state.feedback.effects) if (!effect.failed) paintEffect(ctx, effect, time, skin);
  ctx.restore();
}
