import { Hono } from "hono";
import type { SessionEnv } from "../accounts/data/session";
import { requestClient } from "../accounts/data/supabase";
import { readConfig } from "../../config";
import { ApiError } from "../../errors";
import { readJsonBody } from "../../shared/data/requestBody";
import { binaryBody } from "../../shared/data/binaryBody";
import { serviceKey } from "../../shared/data/serviceKey";
import { mapHash, mapCursor, ONLINE_CHART_BYTES, ONLINE_MAP_BYTES, publishedMap } from "../../../src/features/maps/domain/published";
import { mapObject } from "../../../src/features/maps/domain/mapSet";
import { parsePlayerId } from "../../../src/features/friends/domain/connections";
import { unpackMap } from "../../../src/features/maps/data/package";
import { archiveHash, mapBucket, mediaKey, uploadSlot } from "./data/media";
import { completePublication, mapRpc } from "./data/publication";

export const maps = new Hono<SessionEnv>();
function input<T>(parse: () => T): T { try { return parse(); } catch { throw new ApiError(400, "invalid_map", "Check the map details."); } }
const publicDb = (env: SessionEnv["Bindings"]) => { const config = readConfig(env); return requestClient(config.url, config.key); };

maps.get("/maps", async c => {
  const query = c.req.query("q") ?? "", cursor = input(() => mapCursor(c.req.query("beforeTime"), c.req.query("beforeRevision")));
  if (query.length > 80 || /[\x00-\x1f\x7f]/.test(query)) throw new ApiError(400, "invalid_map", "Search with up to 80 characters.");
  const rows = await mapRpc(publicDb(c.env), "list_published_maps", { p_query: query, p_before_time: cursor?.time ?? null, p_before_revision: cursor?.revision ?? null });
  if (!Array.isArray(rows) || rows.length > 31) throw new Error("Invalid map page.");
  const items = rows.slice(0, 30).map(publishedMap), last = items.at(-1);
  return c.json({ items, next: rows.length > 30 && last ? { time: last.publishedAt, revision: last.revision } : null });
});
maps.get("/maps/:revision", async c => {
  const revision = input(() => mapHash(c.req.param("revision"))), row = await mapRpc(publicDb(c.env), "published_map", { p_revision: revision });
  if (!row) throw new ApiError(404, "map_unavailable", "This map is unavailable.");
  return c.json(publishedMap(row));
});
maps.get("/maps/:revision/pack", async c => {
  const revision = input(() => mapHash(c.req.param("revision"))), row = await mapRpc(publicDb(c.env), "published_map", { p_revision: revision });
  if (!row) throw new ApiError(404, "map_unavailable", "This map is unavailable.");
  const map = publishedMap(row), file = await mapBucket(c.env).get(mediaKey(map));
  if (!file || file.size !== map.bytes) throw new ApiError(503, "map_media_unavailable", "The map recording is temporarily unavailable. Retry later.");
  // Stream the exact checked archive. Recheck visibility on every request; no public bucket URL.
  return new Response(file.body, { headers: { "Content-Type": "application/octet-stream", "Content-Length": String(file.size),
    "Content-Disposition": `attachment; filename="notsu-${revision.slice(0, 16)}.notsumap"`, "Cache-Control": "private, no-store", "ETag": file.httpEtag } });
});
maps.get("/me/maps", async c => {
  const rows = await mapRpc(c.get("db"), "own_published_maps");
  if (!Array.isArray(rows) || rows.length > 100) throw new Error("Invalid own map list.");
  return c.json({ items: rows.map(publishedMap) });
});
maps.put("/me/maps/:revision", async c => {
  const revision = input(() => mapHash(c.req.param("revision"))), uploadId = input(() => parsePlayerId(c.req.query("uploadId")));
  if (c.req.query("rights") !== "confirmed") throw new ApiError(400, "rights_required", "Confirm that you can distribute this pack and its music.");
  if (c.req.header("Content-Type") !== "application/octet-stream") throw new ApiError(415, "pack_required", "Send a complete .notsumap package.");
  const bucket = mapBucket(c.env); serviceKey(c.env);
  return uploadSlot(async () => {
    const begun = mapObject(await mapRpc(c.get("db"), "begin_map_upload", { p_id: uploadId, p_revision: revision }));
    if (begun.entry) {
      void c.req.raw.body?.cancel().catch(() => undefined);
      return c.json(publishedMap(begun.entry));
    }
    const id = parsePlayerId(begun.id), bytes = await binaryBody(c.req.raw, ONLINE_MAP_BYTES);
    let loaded;
    try {
      loaded = await unpackMap(bytes, { maxBytes: ONLINE_MAP_BYTES, maxChartBytes: ONLINE_CHART_BYTES });
      if (loaded.revision !== revision || loaded.set.difficulties.some(d => !d.chart.notes.length)) throw new Error();
    } catch { throw new ApiError(400, "invalid_map", "This pack is invalid, exceeds the online limits, or contains an empty difficulty. Repair it in the editor."); }
    const sha256 = await archiveHash(bytes), owner = c.get("userId");
    await bucket.put(mediaKey({ publisherId: owner, revision, archiveSha256: sha256 }), bytes,
      { onlyIf: new Headers({ "If-None-Match": "*" }), sha256, httpMetadata: { contentType: "application/octet-stream" } });
    const result = await completePublication(c.env, c.req.header("Authorization")!.slice(7), owner, id, loaded, sha256, bytes.byteLength);
    return c.json(result);
  });
});
maps.put("/me/maps/:revision/visibility", async c => {
  const revision = input(() => mapHash(c.req.param("revision")));
  const body = await details(c.req.raw), version = input(() => parsePlayerId(body.version));
  if (typeof body.visible !== "boolean" || Object.keys(body).some(key => !["version", "visible"].includes(key))) throw new ApiError(400, "invalid_map", "Choose a visibility action.");
  return c.json(publishedMap(await mapRpc(c.get("db"), "set_map_visibility", { p_revision: revision, p_version: version, p_visible: body.visible })));
});
maps.put("/me/moderation/maps/:revision", async c => {
  const revision = input(() => mapHash(c.req.param("revision"))), body = await details(c.req.raw);
  const version = input(() => parsePlayerId(body.version)), id = input(() => parsePlayerId(body.id));
  if (typeof body.hidden !== "boolean" || typeof body.note !== "string" || !body.note.trim() || body.note.length > 500 || /[\x00-\x1f\x7f]/.test(body.note) ||
    Object.keys(body).some(key => !["version", "id", "hidden", "note"].includes(key))) throw new ApiError(400, "invalid_map", "Provide a map decision and reason.");
  return c.json(publishedMap(await mapRpc(c.get("db"), "review_map_visibility", { p_revision: revision, p_version: version, p_action: id, p_hidden: body.hidden, p_note: body.note })));
});

async function details(request: Request) {
  if (request.headers.get("Content-Type")?.split(";")[0].trim() !== "application/json") throw new ApiError(415, "json_required", "Send JSON details.");
  const value = await readJsonBody(request);
  return input(() => mapObject(value));
}
