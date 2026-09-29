import { afterEach, expect, it, vi } from "vitest";
import { recordJob } from "./recordJob";
import { completed, source } from "./records.fixture";
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
it("terminates successful, failed, uncloneable and stalled workers with no dangling timers", async () => {
  const run = await completed(); vi.useFakeTimers();
  let instance: { onmessage?: (event: { data: unknown }) => void; onerror?: () => void } = {}, failPost = false;
  const terminate = vi.fn();
  vi.stubGlobal("Worker", class { constructor() { instance = this; } onmessage?: (event: { data: unknown }) => void; onerror?: () => void;
    terminate = terminate; postMessage() { if (failPost) throw new Error("Cannot clone"); }
  });
  const request = { action: "prepare" as const, run, source };
  const success = recordJob(request); instance.onmessage?.({ data: { value: "checked" } }); expect(await success).toBe("checked");
  const rejection = expect(recordJob(request)).rejects.toThrow("Malformed replay"); instance.onmessage?.({ data: { error: "Malformed replay" } }); await rejection;
  const crashed = expect(recordJob(request)).rejects.toThrow("checking failed"); instance.onerror?.(); await crashed;
  failPost = true; await expect(recordJob(request)).rejects.toThrow("Cannot clone"); failPost = false;
  const stalled = expect(recordJob(request)).rejects.toThrow("timed out"); await vi.advanceTimersByTimeAsync(30000); await stalled;
  expect(terminate).toHaveBeenCalledTimes(5); expect(vi.getTimerCount()).toBe(0);
});
