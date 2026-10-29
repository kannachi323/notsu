import app from "./app";
import type { Bindings } from "./config";
import { retainMapMedia } from "./features/maps/data/retention";

export default {
  fetch: app.fetch,
  async scheduled(_event:unknown,env:Bindings) {
    try { const result = await retainMapMedia(env); console.info(JSON.stringify({ event:"map_media_retention",...result })); }
    catch { console.error(JSON.stringify({ event:"map_media_retention_failed" })); throw new Error("Map media retention failed."); }
  },
};
