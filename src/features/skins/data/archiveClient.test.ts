import { afterEach, expect, it, vi } from "vitest";
import { archiveJob } from "./archiveClient";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("terminates stalled workers and cleans up after a message cannot be cloned", async () => {
  vi.useFakeTimers(); const terminate = vi.fn(); let failPost = false;
  vi.stubGlobal("Worker", class { terminate = terminate; postMessage() { if (failPost) throw new Error("Cannot clone"); } });
  const timeout = expect(archiveJob({ action: "unpack", bytes: new Uint8Array() })).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(15000); await timeout; expect(terminate).toHaveBeenCalledOnce();
  failPost = true;
  await expect(archiveJob({ action: "unpack", bytes: new Uint8Array() })).rejects.toThrow("Cannot clone");
  expect(terminate).toHaveBeenCalledTimes(2); expect(vi.getTimerCount()).toBe(0);
});
