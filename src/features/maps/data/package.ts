import { packZip, unpackZip } from "../../../shared/data/zip";
import type { ZipPolicy } from "../../../shared/data/zip";
import { mapObject, readMapSet } from "../domain/mapSet";
import type { MapSet } from "../domain/mapSet";

export const MAX_MAP_BYTES = 128 * 1024 * 1024;
const policy: ZipPolicy = {
  label: "Map", maxArchive: MAX_MAP_BYTES, maxExpanded: MAX_MAP_BYTES, maxFiles: 18, required: ["map.json"],
  limitFor: name => name === "map.json" ? 64 * 1024 : /^charts\/([1-9]|1[0-6])\.json$/.test(name) ? 4 * 1024 * 1024 : /^audio\.(mp3|wav)$/.test(name) ? 100 * 1024 * 1024 : 0,
};
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
const decode = (bytes: Uint8Array | undefined): unknown => {
  if (!bytes) throw new Error("The map package is missing a required file.");
  try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)); }
  catch { throw new Error("The map package contains invalid JSON."); }
};
const hash = async (bytes: Uint8Array) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes))), byte => byte.toString(16).padStart(2, "0")).join("");
const audioPath = (set: MapSet) => set.song.mime === "audio/mpeg" ? "audio.mp3" : "audio.wav";
export const mapRevision = (set: MapSet) => hash(encode(readMapSet(set)));
export type LoadedMap = { set: MapSet; revision: string; audio: Uint8Array };
async function checkAudio(set: MapSet, audio: Uint8Array | undefined) {
  if (!audio || audio.length !== set.song.size || await hash(audio) !== set.song.sha256) throw new Error("The packaged recording failed its size or fingerprint check.");
}
/** These operations run in a terminable worker. Nothing is extracted to disk. */
export async function packMap(source: MapSet, audio: Uint8Array): Promise<{ bytes: Uint8Array; revision: string }> {
  const set = readMapSet(source); await checkAudio(set, audio);
  const files: Record<string, Uint8Array> = Object.create(null);
  const difficulties = set.difficulties.map((difficulty, index) => {
    const path = `charts/${index + 1}.json`; files[path] = encode(difficulty.chart);
    return { id: difficulty.chart.id, name: difficulty.name, author: difficulty.author, path };
  });
  files["map.json"] = encode({ ...set, difficulties }); files[audioPath(set)] = audio;
  return { bytes: packZip(files, policy), revision: await mapRevision(set) };
}
export async function unpackMap(bytes: Uint8Array, limits?: { maxBytes: number; maxChartBytes: number }): Promise<LoadedMap> {
  if (limits && (!Number.isSafeInteger(limits.maxBytes) || limits.maxBytes < 22 || limits.maxBytes > MAX_MAP_BYTES ||
    !Number.isSafeInteger(limits.maxChartBytes) || limits.maxChartBytes < 1 || limits.maxChartBytes > 4 * 1024 * 1024)) throw new Error("Invalid package limits.");
  const bounded = limits ? { ...policy, maxArchive: limits.maxBytes, maxExpanded: limits.maxBytes,
    limitFor: (name: string) => Math.min(policy.limitFor(name), name.startsWith("charts/") ? limits.maxChartBytes : limits.maxBytes) } : policy;
  const files = unpackZip(bytes, bounded), raw = mapObject(decode(files["map.json"]));
  if (!Array.isArray(raw.difficulties) || !raw.difficulties.length || raw.difficulties.length > 16) throw new Error("Invalid difficulty list.");
  const used = new Set(["map.json"]);
  const difficulties = raw.difficulties.map(value => {
    const entry = mapObject(value);
    if (typeof entry.path !== "string" || !/^charts\/([1-9]|1[0-6])\.json$/.test(entry.path) || used.has(entry.path)) throw new Error("Invalid or duplicate difficulty path.");
    used.add(entry.path); const chart = mapObject(decode(files[entry.path]));
    if (chart.id !== entry.id) throw new Error("A difficulty ID does not match its chart.");
    return { name: entry.name, author: entry.author, chart };
  });
  const set = readMapSet({ ...raw, difficulties }), path = audioPath(set); used.add(path);
  if (Object.keys(files).some(name => !used.has(name))) throw new Error("The map contains unreferenced files.");
  const audio = files[path]; await checkAudio(set, audio);
  return { set, audio, revision: await mapRevision(set) };
}
