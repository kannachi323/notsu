import { ApiError } from "../../../errors";

/** Count received bytes even when Content-Length is absent or incorrect. */
export async function readAccountBody(request: Request): Promise<unknown> {
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, "invalid_request", "Send account details.");
  let timer: ReturnType<typeof setTimeout> | undefined;
  const read = async () => {
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) throw new ApiError(413, "request_too_large", "Account details exceed the request limit.");
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
    catch { throw new ApiError(400, "invalid_request", "Send valid account details."); }
  };
  try {
    return await Promise.race([read(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ApiError(408, "request_timeout", "The request took too long. Try again.")), 5000);
    })]);
  } finally {
    clearTimeout(timer);
    // Cancellation itself must not extend the deadline on an unresponsive stream.
    void reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
