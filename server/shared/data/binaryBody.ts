import { ApiError } from "../../errors";

/** Fixed-size allocation avoids holding both an unbounded chunk list and a copy. */
export async function binaryBody(request: Request, max: number, timeoutMs = 30000): Promise<Uint8Array> {
  const advertised = request.headers.get("Content-Length");
  if (advertised && (!/^\d+$/.test(advertised) || Number(advertised) > max)) throw new ApiError(413, "map_too_large", "The map pack exceeds the online upload limit.");
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "invalid_map", "Send a complete map pack.");
  const bytes = new Uint8Array(max); let size = 0, timer: ReturnType<typeof setTimeout> | undefined;
  const read = async () => {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > max) throw new ApiError(413, "map_too_large", "The map pack exceeds the online upload limit.");
      bytes.set(value, size); size += value.byteLength;
    }
    if (size < 22) throw new ApiError(400, "invalid_map", "Send a complete map pack.");
    return bytes.subarray(0, size);
  };
  try {
    return await Promise.race([read(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ApiError(408, "request_timeout", "The upload took too long. Retry the same pack.")), timeoutMs);
    })]);
  } finally { clearTimeout(timer); void reader.cancel().catch(() => undefined); reader.releaseLock(); }
}

/** Read and drop an upload the server no longer needs (an identical retry or an
 * early refusal). Responding while the client is still sending makes the
 * runtime reset the connection, so the client sees a network error instead of
 * the response. Bounded by `max` bytes and a timeout; past either, cancel. */
export async function discardBody(request: Request, max: number, timeoutMs = 30000): Promise<void> {
  const advertised = Number(request.headers.get("Content-Length") ?? 0);
  const reader = request.body?.getReader();
  if (!reader) return;
  if (advertised > max) { void reader.cancel().catch(() => undefined); return; }
  const deadline = Date.now() + timeoutMs;
  let size = 0;
  try {
    while (Date.now() < deadline) {
      const { done, value } = await reader.read();
      if (done || (size += value.byteLength) > max) return;
    }
  } catch { /* The client went away; nothing to reply to. */ }
  finally { void reader.cancel().catch(() => undefined); }
}
