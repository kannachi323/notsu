import { APPROACH_MS, lanePoseInto } from "../domain/chart";
import type { Lane, Pose } from "../domain/chart";
import { laneAnchor, WORLD_HEIGHT, WORLD_WIDTH } from "../domain/layout";
import type { Anchor } from "../domain/layout";
import type { NoteState } from "../domain/session";
import type { Runtime } from "../useRhythmGame";
import { getSkin } from "./skins";
import type { Skin } from "./skins";
import { orb, paintEffect, ribbon, target } from "./orbs";
import { barSprite } from "./sprites";

export type PlayfieldState = Pick<Runtime, "phase" | "timeMs" | "settings" | "feedback"> & {
  session: Pick<Runtime["session"], "chart" | "assists" | "visibleStates">;
};
type LaneView = { pose: Pose & { length: number }; anchor: Anchor; notes: NoteState[] };

// Reused between frames: the canvas loop runs at display rate, so it uses
// indexed loops and long-lived buffers instead of per-frame arrays/iterators.
const visible: NoteState[] = [];
const views: LaneView[] = [];
const hint: Anchor = { x: 0, y: 0, radians: 0 };

function beginLane(ctx: CanvasRenderingContext2D, view: LaneView) {
  ctx.save(); ctx.translate(view.anchor.x, view.anchor.y); ctx.rotate(view.anchor.radians);
}
const along = (at: number, time: number, length: number) => (at - time) / APPROACH_MS * length;

function paintLaneBase(ctx: CanvasRenderingContext2D, view: LaneView, skin: Skin) {
  beginLane(ctx, view);
  ctx.strokeStyle = skin.lane.color; ctx.lineWidth = skin.lane.width;
  ctx.beginPath();
  if (!barSprite(ctx, skin, "lane", -24, view.pose.length, skin.lane.width)) { ctx.moveTo(-24, 0); ctx.lineTo(view.pose.length, 0); }
  ctx.moveTo(view.pose.length, -4); ctx.lineTo(view.pose.length, 4); ctx.stroke();
  ctx.restore();
}

/** Crosshair at the next authored destination, shown shortly before a move. */
function paintMoveHint(ctx: CanvasRenderingContext2D, lane: Lane, pose: Pose, time: number, skin: Skin) {
  const motion = lane.motion;
  for (let i = 0; i < motion.length; i++) {
    const next = motion[i];
    if (next.timeMs <= time) continue;
    if (next.timeMs - time >= 900) return;
    if (next.x === pose.x && next.y === pose.y && next.angle === pose.angle) return;
    laneAnchor(next, next.length, hint);
    ctx.globalAlpha = .45; ctx.strokeStyle = skin.lane.hint; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(hint.x - 5, hint.y); ctx.lineTo(hint.x + 5, hint.y);
    ctx.moveTo(hint.x, hint.y - 5); ctx.lineTo(hint.x, hint.y + 5); ctx.stroke(); ctx.globalAlpha = 1;
    return;
  }
}

export function paintPlayfield(ctx: CanvasRenderingContext2D, width: number, height: number, state: PlayfieldState) {
  ctx.clearRect(0, 0, width, height);
  const scale = Math.min(width / WORLD_WIDTH, height / WORLD_HEIGHT);
  ctx.save();
  ctx.translate((width - WORLD_WIDTH * scale) / 2, (height - WORLD_HEIGHT * scale) / 2);
  ctx.scale(scale, scale);
  const skin = getSkin(state.settings.skinId);
  const frozen = state.session.assists.freezeMotion;
  const preview = state.phase === "setup" || state.phase === "starting";
  const time = preview ? Math.max(0, (state.session.chart.notes[0]?.timeMs ?? 0) - APPROACH_MS * .8) : state.timeMs;
  // The editor preview supplies its own list, so use the returned array.
  const shown = state.session.visibleStates(time, visible);
  const lanes = state.session.chart.lanes;
  views.length = Math.min(views.length, lanes.length);
  for (let i = 0; i < lanes.length; i++) {
    const view = views[i] ??= { pose: { x: 0, y: 0, angle: 0, length: 0 }, anchor: { x: 0, y: 0, radians: 0 }, notes: [] };
    lanePoseInto(lanes[i], frozen ? 0 : Math.max(0, time), view.pose);
    laneAnchor(view.pose, view.pose.length, view.anchor);
    view.notes.length = 0;
    for (let n = 0; n < shown.length; n++) if (shown[n].note.laneIds.includes(lanes[i].id)) view.notes.push(shown[n]);
  }

  // Base lanes first; no later line can obscure a note on a different lane.
  const hints = !state.settings.reducedMotion && !frozen && !preview;
  for (let i = 0; i < lanes.length; i++) {
    paintLaneBase(ctx, views[i], skin);
    if (hints) paintMoveHint(ctx, lanes[i], views[i].pose, time, skin);
  }
  const effects = state.feedback.effects;
  for (let i = 0; i < effects.length; i++) if (effects[i].failed) paintEffect(ctx, effects[i], time, skin);
  for (let i = 0; i < lanes.length; i++) {
    const view = views[i], length = view.pose.length;
    beginLane(ctx, view);
    for (let n = 0; n < view.notes.length; n++) {
      const { note, head } = view.notes[n];
      if (note.kind === "hold") ribbon(ctx, head ? 0 : along(note.timeMs, time, length), Math.min(length, along(note.endMs, time, length)), skin);
    }
    ctx.restore();
  }
  for (let i = 0; i < lanes.length; i++) {
    const view = views[i], length = view.pose.length;
    beginLane(ctx, view);
    for (let n = 0; n < view.notes.length; n++) {
      const { note, head } = view.notes[n];
      if (note.kind !== "hold") continue;
      orb(ctx, head ? 0 : along(note.timeMs, time, length), skin.note.hold, skin);
      const end = along(note.endMs, time, length);
      if (end <= length) orb(ctx, end, skin.note.hold, skin, true);
    }
    ctx.restore();
  }
  for (let i = 0; i < lanes.length; i++) {
    const view = views[i];
    beginLane(ctx, view);
    for (let n = 0; n < view.notes.length; n++) {
      const { note } = view.notes[n];
      if (note.kind === "tap") orb(ctx, along(note.timeMs, time, view.pose.length), skin.note.tap, skin);
    }
    ctx.restore();
  }
  for (let i = 0; i < lanes.length; i++) {
    const view = views[i];
    beginLane(ctx, view);
    let holding = false;
    for (let n = 0; n < view.notes.length && !holding; n++) {
      const { note, head, tail } = view.notes[n];
      holding = note.kind === "hold" && !!head && !tail;
    }
    target(ctx, skin, holding);
    ctx.restore();
  }
  // Successful effects retain their judgement-time world positions.
  for (let i = 0; i < effects.length; i++) if (!effects[i].failed) paintEffect(ctx, effects[i], time, skin);
  ctx.restore();
}
