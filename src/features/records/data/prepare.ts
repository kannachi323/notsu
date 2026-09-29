import { chartFingerprint } from "../../rhythm/data/chartFingerprint";
import { validateReplay, verifyReplay } from "../../rhythm/domain/replay";
import type { Chart } from "../../rhythm/domain/chart";
import { checkSource, MAX_REPLAY_BYTES, readRecord } from "../domain/records";
import type { CompletedRun, RecordSource, SavedPerformance } from "../domain/records";

export async function prepareRecord(run: CompletedRun, source: RecordSource): Promise<SavedPerformance> {
  checkSource(source);
  const hash = await chartFingerprint(run.chart);
  validateReplay(run.replay, run.chart, hash);
  const summary = verifyReplay(run.chart, run.replay, hash);
  if (JSON.stringify(summary) !== JSON.stringify(run.summary)) throw new Error("The replay did not reproduce this result. The run was not saved.");
  // Store only versioned input fields; extra objects never enter the record archive.
  const replay = { version: run.replay.version, rulesVersion: run.replay.rulesVersion, chartId: run.replay.chartId, chartHash: hash,
    mods: { noFail: run.replay.mods.noFail, autoplay: run.replay.mods.autoplay },
    assists: { freezeMotion: run.replay.assists.freezeMotion, resumed: run.replay.assists.resumed },
    inputs: run.replay.inputs.map(({ atMs, action, key }) => ({ atMs, action, key })) };
  const replayBytes = new TextEncoder().encode(JSON.stringify(replay)).length;
  if (replayBytes > MAX_REPLAY_BYTES) throw new Error("This replay exceeds the 32 MB local replay limit.");
  const record = readRecord({ version: 1, id: run.id, finishedAt: run.finishedAt, ...source, chartId: run.chart.id,
    chartHash: hash, rulesVersion: replay.rulesVersion, title: run.chart.title, summary, mods: replay.mods, replayBytes });
  return { record, replay };
}
export async function checkSavedReplay(saved: SavedPerformance, chart: Chart, source: RecordSource) {
  const row = readRecord(saved.record); checkSource(source);
  if (row.revision !== source.revision || row.setId !== source.setId || row.chartId !== chart.id) throw new Error("Choose this replay's original map revision and difficulty.");
  const hash = await chartFingerprint(chart);
  if (hash !== row.chartHash) throw new Error("The saved replay belongs to different chart content.");
  validateReplay(saved.replay, chart, hash);
  if (JSON.stringify(verifyReplay(chart, saved.replay, hash)) !== JSON.stringify(row.summary) ||
      JSON.stringify(saved.replay.mods) !== JSON.stringify(row.mods) || row.rulesVersion !== saved.replay.rulesVersion) throw new Error("This saved result does not match its replay.");
  return saved.replay;
}
