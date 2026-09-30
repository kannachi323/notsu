import { loadChart } from "../../rhythm/domain/chart";
import { RhythmSession } from "../../rhythm/domain/session";
import { recordReplay } from "../../rhythm/domain/replay";
import type { Mods, Assists } from "../../rhythm/domain/rules";
import { chartFingerprint } from "../../rhythm/data/chartFingerprint";
import type { CompletedRun } from "../domain/records";

export const source = { setId: "set", revision: "b".repeat(64), difficulty: "Normal" };
export const chart = loadChart({ version: 1, id: "records", title: "Original test song", artist: "notsu test", bpm: 120,
  durationMs: 5000, audioOffsetMs: 0, motion: [{ timeMs: 0, x: .2, y: .5, angle: 0 }],
  notes: [{ id: "hold", kind: "hold", timeMs: 1000, endMs: 3000 }, { id: "tap", kind: "tap", timeMs: 2000 }] });
export async function completed(id = "first", options: { mods?: Partial<Mods>; assists?: Partial<Assists>; errorMs?: number; fail?: boolean } = {}): Promise<CompletedRun> {
  const session = new RhythmSession(chart, options.mods, options.assists), error = options.errorMs ?? 0;
  if (options.fail) { for (let i = 0; i < 25; i++) session.press(`extra-${i}`, i); }
  else {
    session.press("KeyF", 1000 + error); session.press("KeyJ", 2000 + error);
    session.release("KeyJ", 2001 + error); session.release("KeyF", 3000 + error);
  }
  session.advance(chart.durationMs);
  return { id, finishedAt: 1790000000000, chart, replay: recordReplay(session, await chartFingerprint(chart)), summary: session.summary() };
}
