import { afterEach, expect, it, vi } from "vitest";
import { mapJob } from "./packageClient";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("terminates a stalled or failed map worker without leaving timers", async () => {
  vi.useFakeTimers(); const terminate = vi.fn(); let failPost = false;
  vi.stubGlobal("Worker", class { terminate = terminate; postMessage() { if (failPost) throw new Error("Cannot clone"); } });
  const timeout = expect(mapJob({ action: "unpack", bytes: new Uint8Array() })).rejects.toThrow("timed out");
  await vi.advanceTimersByTimeAsync(30000); await timeout; expect(terminate).toHaveBeenCalledOnce();
  failPost = true; await expect(mapJob({ action: "unpack", bytes: new Uint8Array() })).rejects.toThrow("Cannot clone");
  expect(vi.getTimerCount()).toBe(0); expect(terminate).toHaveBeenCalledTimes(2);
});
