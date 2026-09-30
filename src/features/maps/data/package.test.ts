import { expect, it } from "vitest";
import { unzipSync, zipSync } from "fflate";
import { MAX_MAP_BYTES, mapRevision, packMap, unpackMap } from "./package";
import { mapFixture } from "./package.fixture";
import { chartFingerprint } from "../../rhythm/data/chartFingerprint";
import { readMapSet } from "../domain/mapSet";
import { readDocument } from "../../editor/domain/document";
import { draftMapSet, mapSetDrafts } from "../../editor/data/mapSet";
const encode = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));
it("round trips the original recording, tempo, geometry and shared holds across multiple difficulties", async () => {
  const { doc, audio } = await mapFixture();
  const second = readDocument({ ...doc, id: "advanced", difficulty: "Advanced", chart: { ...doc.chart, id: "advanced", timing: [{ timeMs: 0, bpm: 140 }, { timeMs: 4000, bpm: 180 }] } });
  const set = draftMapSet(doc, [second]), packed = await packMap(set, audio), loaded = await unpackMap(packed.bytes);
  expect(loaded.set).toEqual(set); expect(loaded.audio).toEqual(audio); expect(loaded.revision).toBe(packed.revision);
  expect(await chartFingerprint(loaded.set.difficulties.find(d => d.chart.id === doc.id)!.chart)).toBe(await chartFingerprint(doc.chart));
  expect(loaded.set.difficulties).toHaveLength(2);
  const restoredDrafts = mapSetDrafts(loaded.set);
  expect(await mapRevision(draftMapSet(restoredDrafts.find(d => d.id === doc.id)!, restoredDrafts))).toBe(packed.revision);
  expect(await mapRevision({ ...set, difficulties: [...set.difficulties].reverse() })).toBe(packed.revision);
});
it("binds revisions to content rather than ZIP compression and ignores unrecognized gameplay fields", async () => {
  const { set, audio } = await mapFixture(), packed = await packMap(set, audio), files = unzipSync(packed.bytes);
  const compressed = await unpackMap(zipSync(files, { level: 9 })); expect(compressed.revision).toBe(packed.revision);
  const changed = structuredClone(set); changed.difficulties[0].chart.notes[0].timeMs += 20;
  expect(await mapRevision(changed)).not.toBe(packed.revision);
  const unknown = { ...set, ranked: true, rules: { perfectWindow: 1000 } };
  expect(await mapRevision(unknown)).toBe(packed.revision); expect(readMapSet(unknown)).not.toHaveProperty("ranked");
});
it("rejects substituted recordings, wrong sizes, missing files and mismatched chart IDs", async () => {
  const { set, audio } = await mapFixture(), packed = await packMap(set, audio), files = unzipSync(packed.bytes);
  await expect(packMap(set, new Uint8Array([9, 8, 7, 6]))).rejects.toThrow("fingerprint");
  await expect(packMap(set, new Uint8Array(5))).rejects.toThrow("size");
  await expect(unpackMap(zipSync({ ...files, "audio.wav": new Uint8Array([9, 8, 7, 6]) }))).rejects.toThrow("fingerprint");
  const missing = { ...files }; delete missing["audio.wav"]; await expect(unpackMap(zipSync(missing))).rejects.toThrow("recording");
  await expect(unpackMap(zipSync({ ...files, "charts/1.json": encode({ ...set.difficulties[0].chart, id: "changed" }) }))).rejects.toThrow("ID");
});
it("rejects traversal, extra media, duplicate difficulty references and oversized archives", async () => {
  const { set, audio } = await mapFixture(), files = unzipSync((await packMap(set, audio)).bytes);
  for (const name of ["../audio.wav", "https://song.mp3", "code.js", "audio.mp3"]) {
    await expect(unpackMap(zipSync({ ...files, [name]: audio }))).rejects.toThrow();
  }
  const manifest = JSON.parse(new TextDecoder().decode(files["map.json"])); manifest.difficulties.push(manifest.difficulties[0]);
  await expect(unpackMap(zipSync({ ...files, "map.json": encode(manifest) }))).rejects.toThrow("duplicate");
  await expect(unpackMap(new Uint8Array(MAX_MAP_BYTES + 1))).rejects.toThrow("128 MB");
  await expect(unpackMap(zipSync({ ...files, "charts/1.json": new Uint8Array(4 * 1024 * 1024 + 1) }))).rejects.toThrow("oversized");
});
it("keeps empty drafts portable but validates difficulty names, identity and recording bounds", async () => {
  const { doc, set, audio } = await mapFixture();
  const empty = structuredClone(set); empty.difficulties[0].chart.notes = [];
  expect((await unpackMap((await packMap(empty, audio)).bytes)).set.difficulties[0].chart.notes).toEqual([]);
  expect(() => readMapSet({ ...set, difficulties: [set.difficulties[0], set.difficulties[0]] })).toThrow("unique");
  const wrong = structuredClone(set); wrong.song.durationMs = 5000; expect(() => readMapSet(wrong)).toThrow("duration");
  expect(() => draftMapSet(doc, [{ ...doc, id: "second", setId: "other", chart: { ...doc.chart, id: "second" } }])).toThrow("same map set");
  const legacy = { ...doc, setId: undefined }; expect(readDocument(legacy).setId).toBe(doc.id);
});
