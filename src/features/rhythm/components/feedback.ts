import { APPROACH_MS, poseAt } from "../domain/chart";
import { laneAnchor, LANE_LENGTH, REST_POSE } from "../domain/layout";
import type { JudgementEvent, RhythmSession } from "../domain/session";
import type { Skin, Tone } from "./skins";

export const MAX_EFFECTS = 32;
export interface HitEffect {
  event: JudgementEvent;
  anchor: ReturnType<typeof laneAnchor>;
  durationMs: number;
  reducedMotion: boolean;
  // A failed note's frozen lane-local geometry; never look up the moving lane again.
  failed?: { head: number; tail?: number; held: boolean };
}

/** Per-attempt presentation state. Scoring never knows this exists. */
export class HitFeedback {
  effects: HitEffect[] = [];
  private lastEventId = 0;
  private missedNotes = new Set<string>();

  consume(session: RhythmSession, skin: Skin, reducedMotion: boolean, play: (tone: Tone) => void) {
    for (const event of session.drainJudgements()) {
      if (event.id <= this.lastEventId) continue;
      this.lastEventId = event.id;
      if (event.grade === "Miss" && event.noteId) {
        if (this.missedNotes.has(event.noteId)) continue;
        this.missedNotes.add(event.noteId);
      }
      const state = session.states.find(state => state.note.id === event.noteId);
      const pose = reducedMotion ? REST_POSE : poseAt(session.chart.motion, event.atMs);
      const effect: HitEffect = { event, anchor: laneAnchor(pose), durationMs: skin.effects.durationMs,
        reducedMotion };
      if (event.grade === "Miss" && state) {
        const held = state.note.kind === "hold" && state.head !== "Miss";
        effect.failed = {
          head: held ? 0 : (state.note.timeMs - event.atMs) / APPROACH_MS * LANE_LENGTH,
          tail: state.note.kind === "hold" ? Math.min(LANE_LENGTH, (state.note.endMs - event.atMs) / APPROACH_MS * LANE_LENGTH) : undefined,
          held,
        };
      }
      this.effects.push(effect);
      if (this.effects.length > MAX_EFFECTS) this.effects.shift();
      if (event.grade !== "Miss" && event.grade !== "Extra") play(event.action === "release" ? skin.sounds.release : skin.sounds.tap);
    }
  }

  expire(timeMs: number) {
    this.effects = this.effects.filter(effect => timeMs - effect.event.atMs < effect.durationMs);
  }

  clear() { this.effects = []; this.lastEventId = 0; this.missedNotes.clear(); }
}
