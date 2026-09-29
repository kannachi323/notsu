import { expect, it } from "vitest";
import { checkSavedReplay, prepareRecord } from "./prepare";
import { chart, completed, source } from "./records.fixture";
it("recomputes completed and failed runs with the shared engine and keeps only replay input fields", async () => {
  for (const fail of [false, true]) {
    const run = await completed("attempt", { fail });
    const saved = await prepareRecord(run, source);
    expect(saved.record.summary).toEqual(run.summary);
    expect(saved.record.replayBytes).toBe(new TextEncoder().encode(JSON.stringify(saved.replay)).length);
    expect(await checkSavedReplay(saved, chart, source)).toEqual(run.replay);
  }
});
it("rejects a forged result, altered chart, wrong map revision and modified persisted replay", async () => {
  const run = await completed(), saved = await prepareRecord(run, source);
  await expect(prepareRecord({ ...run, summary: { ...run.summary, score: 1 } }, source)).rejects.toThrow("reproduce");
  await expect(checkSavedReplay(saved, chart, { ...source, revision: "c".repeat(64) })).rejects.toThrow("revision");
  await expect(checkSavedReplay(saved, { ...chart, title: "Edited" }, source)).rejects.toThrow("content");
  const replay = { ...saved.replay, inputs: [] };
  await expect(checkSavedReplay({ ...saved, replay }, chart, source)).rejects.toThrow("does not match");
  await expect(checkSavedReplay({ ...saved, record: { ...saved.record, mods: { noFail: true, autoplay: false } } }, chart, source)).rejects.toThrow("does not match");
});
it("rejects unsupported rules, malformed input order and wrong fingerprints", async () => {
  const run = await completed();
  for (const replay of [{ ...run.replay, chartHash: "a".repeat(64) }, { ...run.replay, inputs: [...run.replay.inputs].reverse() }, { ...run.replay, rulesVersion: "future" }]) {
    await expect(prepareRecord({ ...run, replay } as typeof run, source)).rejects.toThrow();
  }
});
