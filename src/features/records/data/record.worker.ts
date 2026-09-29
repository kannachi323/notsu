import { checkSavedReplay, prepareRecord } from "./prepare";
import type { RecordRequest } from "./recordJob";
self.onmessage = async (event: MessageEvent<RecordRequest>) => {
  try {
    const request = event.data;
    const value = request.action === "prepare" ? await prepareRecord(request.run, request.source) : await checkSavedReplay(request.saved, request.chart, request.source);
    self.postMessage({ value });
  } catch (cause) { self.postMessage({ error: cause instanceof Error ? cause.message : "The replay could not be checked." }); }
};
