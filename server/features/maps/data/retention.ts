import { readConfig, type Bindings } from "../../../config";
import { requestClient } from "../../accounts/data/supabase";
import { serviceKey } from "../../../shared/data/serviceKey";
import { mapBucket } from "./media";
import { mapRpc } from "./publication";

// Keep failed/abandoned objects for two days, beyond the 30-minute reservation.
// Unique server storage generations prevent a new upload from reusing an old key.
const graceMs = 2*24*60*60*1000;
const ownedKey = /^maps\/[a-f0-9-]{36}\/[a-f0-9]{64}\/(?:[a-f0-9-]{36}\/)?[a-f0-9]{64}\.notsumap$/;
export async function retainMapMedia(env:Bindings, now = Date.now()) {
  const bucket = mapBucket(env), db = requestClient(readConfig(env).url,serviceKey(env));
  let cursor:unknown = await mapRpc(db,"map_media_sweep_cursor");
  if (cursor !== null && (typeof cursor !== "string" || cursor.length>2048)) throw new Error("Invalid retention cursor.");
  let scanned=0,removed=0;
  // At most 500 objects per invocation. Save progress so live files at the start
  // of a large bucket cannot starve cleanup of files later in the inventory.
  for (let page=0;page<5;page++) {
    const before = cursor as string|null;
    const listed = await bucket.list({ prefix:"maps/",limit:100,...(before ? { cursor:before } : {}) });
    if (listed.objects.length>100 || typeof listed.truncated!=="boolean" ||
      (listed.truncated && (!listed.cursor || listed.cursor.length>2048 || listed.cursor===before))) throw new Error("Invalid media inventory.");
    const keys = listed.objects.filter(object=>ownedKey.test(object.key) && object.uploaded instanceof Date &&
      Number.isFinite(object.uploaded.getTime()) && object.uploaded.getTime()<now-graceMs).map(object=>object.key);
    scanned+=listed.objects.length;
    if (keys.length) {
      const referenced:unknown = await mapRpc(db,"referenced_map_media",{ p_keys:keys });
      if (!Array.isArray(referenced) || referenced.some(key=>typeof key!=="string" || !keys.includes(key))) throw new Error("Invalid retained-media response.");
      const retained = new Set(referenced), orphaned=keys.filter(key=>!retained.has(key));
      if (orphaned.length) { await bucket.delete(orphaned); removed+=orphaned.length; }
    }
    cursor=listed.truncated ? listed.cursor! : null;
    const advanced=await mapRpc(db,"advance_map_media_sweep",{ p_before:before,p_after:cursor });
    if (advanced!==true || !listed.truncated) break;
  }
  return { scanned,removed };
}
