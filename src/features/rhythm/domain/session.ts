import { HIT_WINDOW_MS, validateChart } from "./chart";
import type { Chart, Note } from "./chart";

export type Grade = "Perfect" | "Good" | "Okay" | "Miss";
export type Feedback = { grade: Grade | "Extra"; atMs: number; errorMs?: number; action: "tap" | "press" | "release" };
export type JudgementEvent = Feedback & { id: number; noteId?: string };
export type NoteState = { note: Note; head?: Grade; tail?: Grade; key?: string };
export interface Summary {
  accuracy: number;
  combo: number;
  maxCombo: number;
  judged: number;
  expected: number;
  extra: number;
  counts: Record<Grade, number>;
  meanErrorMs: number | null;
}

export function gradeFor(errorMs: number): Grade {
  const distance = Math.abs(errorMs);
  if (distance <= 45) return "Perfect";
  if (distance <= 90) return "Good";
  if (distance <= HIT_WINDOW_MS) return "Okay";
  return "Miss";
}

const weights: Record<Grade, number> = { Perfect: 1, Good: 0.7, Okay: 0.3, Miss: 0 };

/** Deterministic rules only: all times are supplied by the caller's audio clock. */
export class RhythmSession {
  readonly states: NoteState[];
  readonly expected: number;
  feedback: Feedback | null = null;
  private readonly pressed = new Set<string>();
  private counts: Record<Grade, number> = { Perfect: 0, Good: 0, Okay: 0, Miss: 0 };
  private combo = 0;
  private maxCombo = 0;
  private extra = 0;
  private errors: number[] = [];
  private events: JudgementEvent[] = [];
  private eventId = 0;

  /** One ordered consumer drives both visual and audio feedback. */
  drainJudgements(): JudgementEvent[] {
    const events = this.events;
    this.events = [];
    return events;
  }

  constructor(readonly chart: Chart) {
    validateChart(chart);
    this.states = chart.notes.map(note => ({ note }));
    this.expected = chart.notes.reduce((sum, note) => sum + (note.kind === "hold" ? 2 : 1), 0);
  }

  advance(timeMs: number): void {
    for (const state of this.states) {
      if (!state.head && timeMs > state.note.timeMs + HIT_WINDOW_MS) {
        state.head = "Miss";
        this.record("Miss", timeMs, state.note.kind === "hold" ? "press" : "tap", state.note.id);
        if (state.note.kind === "hold") {
          state.tail = "Miss";
          this.record("Miss", timeMs, "release", state.note.id);
        }
      }
      if (state.note.kind === "hold" && state.head && !state.tail &&
          timeMs > state.note.endMs + HIT_WINDOW_MS) {
        state.tail = "Miss";
        this.record("Miss", timeMs, "release", state.note.id);
      }
    }
  }

  press(code: string, timeMs: number): void {
    if (this.pressed.has(code)) return;
    this.pressed.add(code);
    this.advance(timeMs);
    const candidate = this.states.find(state => !state.head &&
      Math.abs(state.note.timeMs - timeMs) <= HIT_WINDOW_MS);
    if (!candidate) {
      this.extra++;
      this.combo = 0;
      this.feedback = { grade: "Extra", atMs: timeMs, action: "tap" };
      this.events.push({ ...this.feedback, id: ++this.eventId });
      return;
    }
    const errorMs = timeMs - candidate.note.timeMs;
    candidate.head = gradeFor(errorMs);
    if (candidate.note.kind === "hold") candidate.key = code;
    this.record(candidate.head, timeMs, candidate.note.kind === "hold" ? "press" : "tap", candidate.note.id, errorMs);
  }

  release(code: string, timeMs: number): void {
    this.pressed.delete(code);
    this.advance(timeMs);
    const held = this.states.find(state => state.note.kind === "hold" && state.key === code && !state.tail);
    if (!held || held.note.kind !== "hold") return;
    const errorMs = timeMs - held.note.endMs;
    held.tail = gradeFor(errorMs);
    this.record(held.tail, timeMs, "release", held.note.id, held.tail === "Miss" ? undefined : errorMs);
  }

  summary(): Summary {
    const judged = Object.values(this.counts).reduce((sum, n) => sum + n, 0);
    const earned = (Object.keys(this.counts) as Grade[])
      .reduce((sum, grade) => sum + this.counts[grade] * weights[grade], 0);
    return {
      accuracy: judged + this.extra ? earned / (judged + this.extra) * 100 : 100,
      combo: this.combo, maxCombo: this.maxCombo, judged, expected: this.expected,
      extra: this.extra, counts: { ...this.counts },
      meanErrorMs: this.errors.length ? this.errors.reduce((sum, n) => sum + n, 0) / this.errors.length : null,
    };
  }

  private record(grade: Grade, atMs: number, action: Feedback["action"], noteId: string, errorMs?: number) {
    this.counts[grade]++;
    this.combo = grade === "Miss" ? 0 : this.combo + 1;
    this.maxCombo = Math.max(this.combo, this.maxCombo);
    if (errorMs !== undefined) this.errors.push(errorMs);
    this.feedback = { grade, atMs, action, errorMs };
    this.events.push({ ...this.feedback, id: ++this.eventId, noteId });
  }
}
