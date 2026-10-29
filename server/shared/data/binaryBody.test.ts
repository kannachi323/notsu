import { expect, it } from "vitest";
import { binaryBody } from "./binaryBody";
import { uploadSlot } from "../../features/maps/data/media";

const streamed = (chunks: Uint8Array[]) => new Request("https://test.invalid", { method: "PUT", body: new ReadableStream({ start(controller) {
  chunks.forEach(chunk => controller.enqueue(chunk)); controller.close();
} }), duplex: "half" } as RequestInit);
it("counts real upload bytes even without Content-Length or with a false small length", async () => {
  await expect(binaryBody(streamed([new Uint8Array(20), new Uint8Array(20)]), 32)).rejects.toMatchObject({ status: 413 });
  const request = streamed([new Uint8Array(40)]); request.headers.set("Content-Length", "22");
  await expect(binaryBody(request, 32)).rejects.toMatchObject({ status: 413 });
  expect((await binaryBody(streamed([new Uint8Array(22)]), 32)).byteLength).toBe(22);
});
it("enforces a deadline even when the producer never sends another byte", async () => {
  const request = new Request("https://test.invalid", { method: "PUT", body: new ReadableStream({}), duplex: "half" } as RequestInit);
  await expect(binaryBody(request, 32, 10)).rejects.toMatchObject({ status: 408 });
});
it("bounds overlapping buffered uploads and frees the slot after a failure", async () => {
  let release!: () => void;
  const current = uploadSlot(() => new Promise<void>(resolve => { release = resolve; }));
  await expect(uploadSlot(async () => 1)).rejects.toMatchObject({ code: "upload_busy" });
  release(); await current;
  await expect(uploadSlot(async () => { throw new Error("storage"); })).rejects.toThrow("storage");
  await expect(uploadSlot(async () => 2)).resolves.toBe(2);
});
