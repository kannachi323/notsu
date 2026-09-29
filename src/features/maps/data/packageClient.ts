import type { MapSet } from "../domain/mapSet";
export type MapRequest = { action: "unpack"; bytes: Uint8Array } | { action: "pack"; set: MapSet; audio: Uint8Array };
export function mapJob<T>(request: MapRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./package.worker.ts", import.meta.url), { type: "module" });
    const finish = () => { clearTimeout(timer); worker.terminate(); };
    const timer = setTimeout(() => { finish(); reject(new Error("Map processing timed out. Try a smaller package.")); }, 30000);
    worker.onmessage = event => { finish(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.value as T); };
    worker.onerror = () => { finish(); reject(new Error("Map processing failed. Your saved maps are unchanged.")); };
    // Clone the input: transferring it would detach an editor's original recording.
    try { worker.postMessage(request); } catch (cause) { finish(); reject(cause); }
  });
}
