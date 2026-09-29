import { packMap, unpackMap } from "./package";
import type { MapRequest } from "./packageClient";
self.onmessage = async (event: MessageEvent<MapRequest>) => {
  try {
    const request = event.data;
    const value = request.action === "unpack" ? await unpackMap(request.bytes) : await packMap(request.set, request.audio);
    const bytes = "bytes" in value ? value.bytes : value.audio;
    self.postMessage({ value }, { transfer: [bytes.buffer] });
  } catch (cause) { self.postMessage({ error: cause instanceof Error ? cause.message : "The map package could not be read." }); }
};
