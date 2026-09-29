import type { RhythmSession } from "./session";

/** Pausing stops the external clock. Only re-grabbing held keys is allowed here;
 * it never creates another head judgment or advances musical time. */
export class PauseCheckpoint {
  readonly requiredKeys: readonly string[];
  private readonly down = new Set<string>();

  constructor(private readonly session: RhythmSession, readonly timeMs: number, private readonly playback = false) {
    if (!Number.isFinite(timeMs) || timeMs < session.latestInputMs) throw new Error("Invalid pause position.");
    this.requiredKeys = playback || session.mods.autoplay ? [] : session.heldKeys();
    if (!playback) {
      // A keyup can be lost while the window is unfocused. Free tap keys now;
      // active holds retain their ownership until the player re-grabs them.
      for (const key of session.pressedKeys()) if (!this.requiredKeys.includes(key)) session.release(key, timeMs);
    }
  }

  setKey(key: string, pressed: boolean): void {
    if (!this.requiredKeys.includes(key)) return;
    if (pressed) this.down.add(key); else this.down.delete(key);
  }
  get missingKeys(): string[] { return this.requiredKeys.filter(key => !this.down.has(key)); }
  get ready(): boolean { return this.missingKeys.length === 0; }
  complete(chartTimeMs: number): void {
    if (!Number.isFinite(chartTimeMs) || chartTimeMs < this.timeMs) throw new Error("The resume count-in has not finished.");
    if (!this.ready) throw new Error("Re-grab active hold keys before resuming.");
    if (!this.playback) this.session.markResumed();
  }
}
