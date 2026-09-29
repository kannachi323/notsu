import { APPROACH_MS, lanePoseAt } from "../domain/chart";
import { laneAnchor } from "../domain/layout";
import type { JudgementEvent, RhythmSession } from "../domain/session";
import type { Skin, Tone } from "./skins";

export const MAX_EFFECTS = 32;
export interface HitEffect {
  event: JudgementEvent;
  anchor: ReturnType<typeof laneAnchor>;
  durationMs: number;
  reducedMotion: boolean;
  failed?: { head: number; tail?: number; held: boolean };
}

/** One sound per logical hit, one anchored visual per visible instance. */
export class HitFeedback {
  effects: HitEffect[] = [];
  private lastEventId = 0;
  private missedNotes = new Set<string>();
  private revision = 0;

  consume(session: RhythmSession, skin: Skin, reducedMotion: boolean, play: (tone: Tone) => void) {
    if (session.revision !== this.revision) { this.clear(); this.revision = session.revision; }
    for (const event of session.drainJudgements()) {
      if (event.id <= this.lastEventId) continue;
      this.lastEventId = event.id;
      if (event.grade === "Miss" && event.noteId) {
        if (this.missedNotes.has(event.noteId)) continue;
        this.missedNotes.add(event.noteId);
      }
      const state = event.noteId ? session.stateFor(event.noteId) : undefined;
      const ids = state?.note.laneIds ?? session.states.find(state => !state.head)?.note.laneIds ?? [session.chart.lanes[0].id];
      for (const lane of session.chart.lanes.filter(lane => ids.includes(lane.id))) {
        const pose = lanePoseAt(lane, event.atMs);
        const effect: HitEffect = { event, anchor: laneAnchor(pose, pose.length), durationMs: skin.effects.durationMs, reducedMotion };
        if (event.grade === "Miss" && state) {
          const held = state.note.kind === "hold" && state.head !== "Miss";
          effect.failed = {
            head: held ? 0 : (state.note.timeMs - event.atMs) / APPROACH_MS * pose.length,
            tail: state.note.kind === "hold" ? Math.min(pose.length, (state.note.endMs - event.atMs) / APPROACH_MS * pose.length) : undefined,
            held,
          };
        }
        this.effects.push(effect);
        if (this.effects.length > MAX_EFFECTS) this.effects.shift();
      }
      if (event.grade !== "Miss" && event.grade !== "Extra") play(event.action === "release" ? skin.sounds.release : skin.sounds.tap);
    }
  }

  expire(timeMs: number) { this.effects = this.effects.filter(effect => timeMs - effect.event.atMs < effect.durationMs); }
  clear() { this.effects = []; this.lastEventId = 0; this.missedNotes.clear(); this.revision = 0; }
}
