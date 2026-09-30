import type { Chart } from "../../rhythm/domain/chart";
import type { Replay } from "../../rhythm/domain/replay";
import type { Summary } from "../../rhythm/domain/session";
import type { Mods } from "../../rhythm/domain/rules";
import { RULES_VERSION } from "../../rhythm/domain/rules";

export type RecordSource = { setId: string; revision: string; difficulty: string };
export type CompletedRun = { id: string; finishedAt: number; chart: Chart; replay: Replay; summary: Summary };
export type LocalRecord = RecordSource & {
  version: 1; id: string; chartId: string; chartHash: string; rulesVersion: string;
  title: string; finishedAt: number; summary: Summary; mods: Mods; replayBytes: number;
};
export type SavedPerformance = { record: LocalRecord; replay: Replay };
export type SaveOutcome = "first" | "improved" | "tied" | "unchanged" | "practice" | "failed" | "already-saved";
export type SaveResult = { record: LocalRecord; outcome: SaveOutcome };
export const MAX_REPLAY_BYTES = 32 * 1024 * 1024;

/** Positive means a better performance. Exact ties have no date/ID advantage. */
export function comparePerformance(a: Summary, b: Summary): number {
  return a.score - b.score || a.maxCombo - b.maxCombo || a.accuracy - b.accuracy;
}
export function isPersonalBestCandidate(record: Pick<LocalRecord, "summary" | "mods">): boolean {
  return record.summary.status === "completed" && !record.mods.autoplay && !record.mods.noFail &&
    !record.summary.assists.freezeMotion && !record.summary.assists.resumed;
}
export function bestRecord(records: LocalRecord[]): LocalRecord | undefined {
  return records.filter(isPersonalBestCandidate).reduce<LocalRecord | undefined>((best, row) =>
    !best || comparePerformance(row.summary, best.summary) > 0 ||
    (comparePerformance(row.summary, best.summary) === 0 && row.finishedAt < best.finishedAt) ? row : best, undefined);
}
export function runDescription(record: Pick<LocalRecord, "summary" | "mods">): string {
  const labels = [record.mods.autoplay && "Autoplay", record.mods.noFail && "No Fail", record.summary.assists.freezeMotion && "Frozen lines", record.summary.assists.resumed && "Resumed"].filter(Boolean);
  return labels.length ? labels.join(" · ") : "Standard";
}
const label = (value: unknown) => typeof value === "string" && value.length > 0 && value.length <= 256 && !/[\x00-\x1f\x7f]/.test(value);
const hash = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
export function checkSource(value: RecordSource) {
  if (!value || !label(value.setId) || !hash(value.revision) || !label(value.difficulty)) throw new Error("Invalid map identity for this record.");
}
/** Validate persisted metadata before displaying it. Playback also recomputes its actual replay. */
export function readRecord(value: unknown): LocalRecord {
  const row = value as LocalRecord | undefined;
  if (!row) throw new Error("Missing local record.");
  checkSource(row);
  if (row.version !== 1 || !label(row.id) || !label(row.chartId) || !label(row.title) || !hash(row.chartHash) || !label(row.rulesVersion) ||
      !Number.isSafeInteger(row.finishedAt) || row.finishedAt < 0 || row.finishedAt > 8640000000000000 || !Number.isSafeInteger(row.replayBytes) || row.replayBytes < 1 || row.replayBytes > MAX_REPLAY_BYTES) throw new Error("Invalid local record metadata.");
  const summary = row.summary;
  if (!summary || !["completed", "failed"].includes(summary.status) || !row.mods || typeof row.mods.autoplay !== "boolean" || typeof row.mods.noFail !== "boolean" ||
      !summary.assists || typeof summary.assists.resumed !== "boolean" || typeof summary.assists.freezeMotion !== "boolean" || typeof summary.rankedEligible !== "boolean") throw new Error("Invalid local result.");
  for (const key of ["score", "combo", "maxCombo", "judged", "expected", "extra"] as const) {
    if (!Number.isSafeInteger(summary[key]) || summary[key] < 0) throw new Error("Invalid local score.");
  }
  if (summary.score > 1000000 || summary.expected < 1 || summary.judged > summary.expected || summary.combo > summary.maxCombo || summary.maxCombo > summary.judged ||
      !Number.isFinite(summary.accuracy) || summary.accuracy < 0 || summary.accuracy > 100 || !Number.isFinite(summary.health) || summary.health < 0 || summary.health > 100 ||
      (summary.meanErrorMs !== null && !Number.isFinite(summary.meanErrorMs)) ||
      (summary.failedAtMs !== null && (!Number.isFinite(summary.failedAtMs) || summary.failedAtMs < -2000))) throw new Error("Invalid local result values.");
  if (!summary.counts || ["Perfect", "Good", "Okay", "Miss"].some(key => !Number.isSafeInteger(summary.counts[key as keyof typeof summary.counts]) || summary.counts[key as keyof typeof summary.counts] < 0) ||
      summary.counts.Perfect + summary.counts.Good + summary.counts.Okay + summary.counts.Miss !== summary.judged ||
      (summary.status === "completed" && (summary.judged !== summary.expected || summary.failedAtMs !== null)) ||
      (summary.status === "failed" && (summary.failedAtMs === null || summary.health !== 0))) throw new Error("Invalid judgement totals.");
  return row;
}
export const recordGroup = (revision: string, chartId: string) => [revision, chartId, RULES_VERSION];
