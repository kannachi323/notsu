import { afterEach, describe, expect, it, vi } from "vitest";
import { readProfileBody } from "./profileBody";

describe("profile request limits", () => {
  afterEach(() => vi.useRealTimers());
  it("counts UTF-8 bytes despite a false Content-Length", async () => {
    const request = new Request("https://api.test/", { method: "PUT", headers: { "Content-Length": "2" },
      body: JSON.stringify({ bio: "🎵".repeat(1100) }) });
    await expect(readProfileBody(request)).rejects.toMatchObject({ status: 413 });
  });
  it("rejects malformed UTF-8 instead of silently changing the profile", async () => {
    const body = new Uint8Array([123, 34, 97, 34, 58, 34, 255, 34, 125]);
    await expect(readProfileBody(new Request("https://api.test/", { method: "PUT", body })))
      .rejects.toMatchObject({ status: 400 });
  });
  it("cancels requests that never finish streaming", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn(() => new Promise<void>(() => {}));
    const body = new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode("{")); }, cancel });
    const request = new Request("https://api.test/", { method: "PUT", body, duplex: "half" } as RequestInit);
    const result = expect(readProfileBody(request)).rejects.toMatchObject({ status: 408 });
    await vi.advanceTimersByTimeAsync(5000);
    await result;
    expect(cancel).toHaveBeenCalledOnce();
    expect(body.locked).toBe(false);
  });
});
