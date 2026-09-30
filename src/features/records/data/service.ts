import type { Chart } from "../../rhythm/domain/chart";
import type { Replay } from "../../rhythm/domain/replay";
import type { CompletedRun, RecordSource, SavedPerformance } from "../domain/records";
import { recordJob } from "./recordJob";
import { readPerformance, storeRecord } from "./storage";

export async function saveLocalRun(run: CompletedRun, source: RecordSource) {
  const prepared = await recordJob<SavedPerformance>({ action: "prepare", run, source });
  return storeRecord(prepared);
}
export async function loadLocalReplay(id: string, chart: Chart, source: RecordSource) {
  const saved = await readPerformance(id);
  return recordJob<Replay>({ action: "check", saved, chart, source });
}
