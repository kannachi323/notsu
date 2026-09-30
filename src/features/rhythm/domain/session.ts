import { loadChart } from "./chart";
import type { Chart, ChartNote, ChartSource } from "./chart";
import { ACCURACY_WEIGHTS, DEFAULT_MODS, HEALTH_CHANGE, HIT_WINDOW_MS, APPROACH_MS, gradeFor, maximumComboCredit } from "./rules";
import type { Assists, Grade, Mods } from "./rules";
export { gradeFor } from "./rules";
export type { Grade } from "./rules";

export type Feedback = { grade: Grade | "Extra"; atMs: number; errorMs?: number; action: "tap" | "press" | "release" };
export type JudgementEvent = Feedback & { id: number; noteId?: string };
export type NoteState = { note: ChartNote; head?: Grade; tail?: Grade; key?: string };
export type InputEvent = { atMs: number; action: "press" | "release"; key: string };
export type RunStatus = "playing" | "failed" | "completed";
export interface Summary {
  accuracy: number;
  score: number;
  health: number;
  status: RunStatus;
  failedAtMs: number | null;
  rankedEligible: boolean;
  assists: Assists;
  combo: number;
  maxCombo: number;
  judged: number;
  expected: number;
  extra: number;
  counts: Record<Grade, number>;
  meanErrorMs: number | null;
}
type Deadline = { atMs: number; state: NoteState; tail: boolean };

/** The same deterministic rules run in the client, editor, and replay verifier. */
export class RhythmSession {
  readonly chart: Chart;
  readonly states: NoteState[];
  readonly expected: number;
  readonly mods: Readonly<Mods>;
  feedback: Feedback | null = null;
  revision = 0;
  private readonly byId: Map<string, NoteState>;
  private readonly pressed = new Set<string>();
  private readonly holds = new Set<NoteState>();
  private readonly deadlines: Deadline[];
  private readonly autoInputs: InputEvent[];
  private readonly history: InputEvent[] = [];
  private readonly maxCredit: number;
  private deadlineIndex = 0;
  private autoIndex = 0;
  private headIndex = 0;
  private status: RunStatus = "playing";
  private failedAtMs: number | null = null;
  private health = 100;
  private counts: Record<Grade, number> = { Perfect: 0, Good: 0, Okay: 0, Miss: 0 };
  private combo = 0;
  private maxCombo = 0;
  private comboCredit = 0;
  private extra = 0;
  private errorSum = 0;
  private errorCount = 0;
  private events: JudgementEvent[] = [];
  private eventId = 0;
  private advancedThrough = -Infinity;
  private judgements: JudgementEvent[] = [];
  private readonly assistance: Assists;

  constructor(source: ChartSource, mods: Partial<Mods> = {}, assists: Partial<Assists> = {}) {
    this.chart = loadChart(source);
    this.mods = Object.freeze({ noFail: mods.noFail === true, autoplay: mods.autoplay === true });
    this.assistance = { freezeMotion: assists.freezeMotion === true, resumed: assists.resumed === true };
    this.states = this.chart.notes.map(note => ({ note }));
    this.byId = new Map(this.states.map(state => [state.note.id, state]));
    this.expected = this.states.reduce((sum, { note }) => sum + (note.kind === "hold" ? 2 : 1), 0);
    this.maxCredit = maximumComboCredit(this.expected);
    this.deadlines = this.states.flatMap(state => [
      { state, tail: false, atMs: state.note.timeMs + HIT_WINDOW_MS },
      ...(state.note.kind === "hold" ? [{ state, tail: true, atMs: state.note.endMs + HIT_WINDOW_MS }] : []),
    ]).sort((a, b) => a.atMs - b.atMs);
    this.autoInputs = this.mods.autoplay ? this.states.flatMap(({ note }): InputEvent[] => [
      { atMs: note.timeMs, action: "press", key: note.id },
      { atMs: note.kind === "hold" ? note.endMs : note.timeMs + 1, action: "release", key: note.id },
    ]).sort((a, b) => a.atMs - b.atMs) : [];
  }

  drainJudgements(): JudgementEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  inputHistory(): InputEvent[] { return this.history.map(event => ({ ...event })); }
  stateFor(id: string): NoteState | undefined { return this.byId.get(id); }
  get assists(): Readonly<Assists> { return { ...this.assistance }; }
  get latestInputMs(): number { return this.history.at(-1)?.atMs ?? -Infinity; }
  pressedKeys(): string[] { return [...this.pressed]; }
  heldKeys(): string[] { return [...this.holds].map(state => state.key!); }
  markResumed(): void { this.assistance.resumed = true; }

  advance(timeMs: number): void {
    this.checkTime(timeMs);
    this.advancedThrough = Math.max(this.advancedThrough, timeMs);
    while (this.autoIndex < this.autoInputs.length && this.autoInputs[this.autoIndex].atMs <= timeMs) {
      const event = this.autoInputs[this.autoIndex++];
      this.applyInput(event);
    }
    this.expire(timeMs);
    this.completeIfDue(timeMs);
  }

  press(key: string, atMs: number): void { this.input({ key, atMs, action: "press" }); }
  release(key: string, atMs: number): void { this.input({ key, atMs, action: "release" }); }

  private input(event: InputEvent) {
    this.checkTime(event.atMs);
    if (this.mods.autoplay || (this.status !== "playing" && event.atMs > this.advancedThrough)) return;
    if (event.atMs > this.chart.durationMs) { this.advance(this.chart.durationMs); return; }
    if (!event.key || event.key.length > 64) throw new Error("Invalid input key.");
    if (event.atMs < (this.history.at(-1)?.atMs ?? -Infinity)) throw new Error("Inputs must be chronological.");
    if ((event.action === "press") === this.pressed.has(event.key)) return;
    this.history.push({ ...event });
    if (event.atMs < this.advancedThrough || this.status !== "playing") this.reconcile();
    else { this.applyInput(event); this.advancedThrough = event.atMs; }
  }

  private applyInput(event: InputEvent) {
    this.expire(event.atMs);
    if (this.status !== "playing") return;
    if (event.action === "release") {
      this.pressed.delete(event.key);
      const held = [...this.holds].find(state => state.key === event.key);
      if (!held || held.note.kind !== "hold") return;
      this.holds.delete(held);
      const error = event.atMs - held.note.endMs;
      held.tail = gradeFor(error);
      this.record(held.tail, event.atMs, "release", held.note.id, held.tail === "Miss" ? undefined : error);
      return;
    }
    this.pressed.add(event.key);
    while (this.headIndex < this.states.length && this.states[this.headIndex].head) this.headIndex++;
    const candidate = this.states[this.headIndex];
    if (!candidate || Math.abs(candidate.note.timeMs - event.atMs) > HIT_WINDOW_MS) {
      this.extra++;
      this.record("Extra", event.atMs, "tap");
      return;
    }
    const error = event.atMs - candidate.note.timeMs;
    candidate.head = gradeFor(error);
    if (candidate.note.kind === "hold") {
      candidate.key = event.key;
      this.holds.add(candidate);
    }
    this.record(candidate.head, event.atMs, candidate.note.kind === "hold" ? "press" : "tap", candidate.note.id, error);
  }

  private expire(timeMs: number) {
    // Strict comparison preserves the inclusive late edge. Event timestamps are
    // the authored deadlines, never whichever frame first noticed the miss.
    while (this.status === "playing" && this.deadlineIndex < this.deadlines.length &&
           this.deadlines[this.deadlineIndex].atMs < timeMs) {
      const { state, tail, atMs } = this.deadlines[this.deadlineIndex++];
      if (tail) {
        if (!state.tail && state.note.kind === "hold") {
          state.tail = "Miss";
          this.holds.delete(state);
          this.record("Miss", atMs, "release", state.note.id);
        }
      } else if (!state.head) {
        state.head = "Miss";
        this.record("Miss", atMs, state.note.kind === "hold" ? "press" : "tap", state.note.id);
        if (state.note.kind === "hold" && this.status === "playing") {
          state.tail = "Miss";
          this.record("Miss", atMs, "release", state.note.id);
        }
      }
    }
  }

  /** Only approaching heads and held ribbons participate in rendering. */
  visibleStates(timeMs: number): NoteState[] {
    let low = 0, high = this.states.length;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.states[mid].note.timeMs < timeMs - HIT_WINDOW_MS) low = mid + 1; else high = mid;
    }
    const visible = new Set(this.holds);
    for (let i = low; i < this.states.length && this.states[i].note.timeMs <= timeMs + APPROACH_MS; i++) {
      if (!this.states[i].head) visible.add(this.states[i]);
    }
    return [...visible];
  }

  summary(): Summary {
    const judged = Object.values(this.counts).reduce((sum, n) => sum + n, 0);
    const earned = (Object.keys(this.counts) as Grade[]).reduce((sum, grade) => sum + this.counts[grade] * ACCURACY_WEIGHTS[grade], 0);
    return {
      accuracy: judged + this.extra ? earned / (judged + this.extra) * 100 : 100,
      score: Math.round(1_000_000 * (.7 * this.comboCredit / this.maxCredit + .3 * earned / (this.expected + this.extra))),
      health: this.health,
      status: this.status,
      failedAtMs: this.failedAtMs,
      rankedEligible: this.status === "completed" && !this.mods.noFail && !this.mods.autoplay &&
        !this.assistance.freezeMotion && !this.assistance.resumed,
      assists: { ...this.assistance },
      combo: this.combo, maxCombo: this.maxCombo, judged, expected: this.expected,
      extra: this.extra, counts: { ...this.counts },
      meanErrorMs: this.errorCount ? this.errorSum / this.errorCount : null,
    };
  }

  private record(grade: Grade | "Extra", atMs: number, action: Feedback["action"], noteId?: string, errorMs?: number) {
    if (grade !== "Extra") this.counts[grade]++;
    this.combo = grade === "Miss" || grade === "Extra" ? 0 : this.combo + 1;
    if (this.combo) this.comboCredit += Math.sqrt(this.combo);
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    if (errorMs !== undefined) { this.errorSum += errorMs; this.errorCount++; }
    this.health = Math.max(0, Math.min(100, this.health + HEALTH_CHANGE[grade]));
    this.feedback = { grade, atMs, action, ...(errorMs !== undefined ? { errorMs } : {}) };
    const event = { ...this.feedback, id: ++this.eventId, ...(noteId ? { noteId } : {}) };
    this.events.push(event); this.judgements.push(event);
    if (this.health === 0 && !this.mods.noFail) {
      this.status = "failed";
      this.failedAtMs = atMs;
    }
  }

  private checkTime(time: number) {
    if (!Number.isFinite(time)) throw new Error("Time must be finite.");
  }

  private completeIfDue(timeMs: number) {
    if (this.status !== "playing" || timeMs < this.chart.durationMs) return;
    // A legal last note can have its inclusive late edge at durationMs. Close
    // that window at completion; timestamped inputs at the edge can reconcile it.
    this.expire(Infinity);
    if (this.status === "playing") this.status = "completed";
  }

  /** A render frame may run before delivery of an earlier timestamped input.
   * Rebuild only on that exceptional path; ordinary frames use sorted deadlines.
   * Emit only changed judgements, so already-heard successful hits do not replay.
   */
  private reconcile() {
    const signature = (event: JudgementEvent) => JSON.stringify([event.noteId, event.action, event.grade, event.atMs, event.errorMs]);
    const previous = new Map<string, number>();
    for (const event of this.judgements) {
      const key = signature(event); previous.set(key, (previous.get(key) ?? 0) + 1);
    }
    for (const state of this.states) { delete state.head; delete state.tail; delete state.key; }
    this.pressed.clear(); this.holds.clear();
    this.counts = { Perfect: 0, Good: 0, Okay: 0, Miss: 0 };
    this.deadlineIndex = this.headIndex = this.combo = this.maxCombo = this.comboCredit = this.extra = this.errorSum = this.errorCount = 0;
    this.health = 100; this.status = "playing"; this.failedAtMs = null;
    this.feedback = null; this.events = []; this.judgements = [];
    for (const event of this.history) this.applyInput(event);
    this.expire(this.advancedThrough);
    this.completeIfDue(this.advancedThrough);
    this.events = this.events.filter(event => {
      const key = signature(event), count = previous.get(key) ?? 0;
      if (count) { previous.set(key, count - 1); return false; }
      return true;
    });
    this.revision++;
  }
}

export const standardMods = DEFAULT_MODS;
