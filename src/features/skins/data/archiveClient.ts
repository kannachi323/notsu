type Request = { action: "unpack"; bytes: Uint8Array } | { action: "pack"; files: Record<string, Uint8Array> };
export function archiveJob<T extends Uint8Array | Record<string, Uint8Array>>(request: Request): Promise<T> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./archive.worker.ts", import.meta.url), { type: "module" });
    const finish = () => { clearTimeout(timer); worker.terminate(); };
    const timer = setTimeout(() => { finish(); reject(new Error("Skin processing timed out. Try a smaller pack.")); }, 15000);
    worker.onmessage = event => {
      finish(); if (event.data.error) reject(new Error(event.data.error)); else resolve(event.data.value as T);
    };
    worker.onerror = () => { finish(); reject(new Error("Skin processing failed. The current skin is unchanged.")); };
    try { worker.postMessage(request); } catch (cause) { finish(); reject(cause); }
  });
}
