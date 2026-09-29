import { packSkin, unpackSkin } from "./archive";
type Request = { action: "unpack"; bytes: Uint8Array } | { action: "pack"; files: Record<string, Uint8Array> };
self.onmessage = (event: MessageEvent<Request>) => {
  try {
    const value = event.data.action === "unpack" ? unpackSkin(event.data.bytes) : packSkin(event.data.files);
    self.postMessage({ value });
  } catch (cause) { self.postMessage({ error: cause instanceof Error ? cause.message : "Skin archive could not be read." }); }
};
