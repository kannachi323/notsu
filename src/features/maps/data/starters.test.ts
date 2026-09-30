import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import catalog from "./starterCatalog.json";
import { unpackMap } from "./package";
import { starterFile, withStarterMaps } from "./starters";
import { RhythmSession } from "../../rhythm/domain/session";

it.each(catalog)("ships $title as a complete, playable pack matching the visible catalog", async row => {
  const bytes = readFileSync(new URL(`../../../../public/maps/${row.file}`, import.meta.url));
  const { set, audio, revision } = await unpackMap(new Uint8Array(bytes));
  expect(revision).toBe(row.revision);
  expect(starterFile(revision)).toBe(row.file);
  expect(set).toMatchObject({ id: row.setId, title: row.title, artist: row.artist, author: row.author });

  // Check the committed audio itself, not just its manifest or generated metadata.
  const wav = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  const text = new TextDecoder();
  expect(text.decode(audio.slice(0, 4))).toBe("RIFF");
  expect(text.decode(audio.slice(8, 16))).toBe("WAVEfmt ");
  expect(wav.getUint16(20, true)).toBe(1); // PCM
  expect(wav.getUint16(22, true)).toBe(1); // Mono
  expect(wav.getUint16(34, true)).toBe(16);
  expect(wav.getUint32(40, true) + 44).toBe(audio.byteLength);
  const duration = (audio.byteLength - 44) / wav.getUint32(28, true) * 1000;
  expect(duration).toBeCloseTo(set.song.durationMs, 3);
  let energy = 0, peak = 0;
  for (let i = 44; i < audio.byteLength; i += 2) {
    const sample = wav.getInt16(i, true) / 32768;
    energy += sample * sample; peak = Math.max(peak, Math.abs(sample));
  }
  expect(Math.sqrt(energy / ((audio.byteLength - 44) / 2))).toBeGreaterThan(.01);
  expect(peak).toBeLessThan(.99);
  expect(set.difficulties).toHaveLength(2);
  for (const difficulty of set.difficulties) {
    const { chart } = difficulty;
    expect(row.difficulties.find(d => d.id === chart.id)).toMatchObject({
      name: difficulty.name, notes: chart.notes.length, lanes: chart.lanes.length, durationMs: chart.durationMs,
    });
    expect(chart.audioOffsetMs + chart.durationMs).toBeLessThanOrEqual(duration + 1);
    const run = new RhythmSession(chart, { autoplay: true });
    run.advance(chart.durationMs);
    expect(run.summary()).toMatchObject({ status: "completed", score: 1000000, accuracy: 100, extra: 0 });
  }
});

it("keeps all bundled packs available without duplicating saved favorites or revisions", () => {
  expect(withStarterMaps([])).toHaveLength(3);
  const favorite = { ...catalog[0], favorite: true, importedAt: 500 };
  const customRevision = { ...favorite, revision: "f".repeat(64), importedAt: 600 };
  const rows = withStarterMaps([customRevision, favorite]);
  expect(rows).toHaveLength(4);
  expect(rows.find(row => row.revision === favorite.revision)).toEqual(favorite);
  expect(rows[0]).toEqual(customRevision);
  expect(starterFile(customRevision.revision)).toBeUndefined();
});
