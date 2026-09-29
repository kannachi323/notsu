import type { Chart } from "../../rhythm/domain/chart";
import type { CompletedRun, RecordSource, SavedPerformance } from "../domain/records";
export type RecordRequest = { action: "prepare"; run: CompletedRun; source: RecordSource } | { action: "check"; saved: SavedPerformance; chart: Chart; source: RecordSource };
/** Replay recomputation stays off the rendering/input thread. */
export function recordJob<T>(request: RecordRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./record.worker.ts", import.meta.url), { type: "module" });
    const finish = () => { clearTimeout(timer); worker.terminate(); };
    const timer = setTimeout(() => { finish(); reject(new Error("Replay checking timed out. Your existing records are unchanged.")); }, 30000);
    worker.onmessage = event => { finish(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.value as T); };
    worker.onerror = () => { finish(); reject(new Error("Replay checking failed. Your existing records are unchanged.")); };
    try { worker.postMessage(request); } catch (cause) { finish(); reject(cause); }
  });
}
