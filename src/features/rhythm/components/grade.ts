import type { Summary } from "../domain/session";

export type LetterGrade = "S" | "A" | "B" | "C" | "D" | "F";

/** Presentation-only letter for the results screen. It never affects score,
 * records or rankings, which use the numeric summary. */
export function letterGrade(summary: Pick<Summary, "status" | "accuracy" | "counts" | "extra">): LetterGrade {
  if (summary.status === "failed") return "F";
  if (summary.accuracy >= 95 && summary.counts.Miss === 0 && summary.extra === 0) return "S";
  if (summary.accuracy >= 90) return "A";
  if (summary.accuracy >= 80) return "B";
  if (summary.accuracy >= 70) return "C";
  return "D";
}

/** A clean 100% run: shown as a starred S rather than a second letter. */
export const isPerfect = (summary: Pick<Summary, "status" | "accuracy" | "counts" | "extra">) =>
  summary.status === "completed" && summary.accuracy >= 100 && summary.counts.Miss === 0 && summary.extra === 0;

/** Count signed errors into equal bins across the full hit window. */
export function timingHistogram(errors: readonly number[], windowMs: number, bins: number): number[] {
  const counts = new Array<number>(bins).fill(0), width = windowMs * 2 / bins;
  for (const error of errors) counts[Math.min(bins - 1, Math.max(0, Math.floor((error + windowMs) / width)))]++;
  return counts;
}
