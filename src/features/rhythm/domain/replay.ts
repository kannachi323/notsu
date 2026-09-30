import type { Chart, ChartSource } from "./chart";
import { loadChart } from "./chart";
import type { Assists, Mods } from "./rules";
import { RULES_VERSION } from "./rules";
import { RhythmSession } from "./session";

export type ReplayInput = { atMs: number; action: "press" | "release"; key: number };
export interface Replay {
  version: 2;
  rulesVersion: typeof RULES_VERSION;
  chartId: string;
  chartHash: string;
  mods: Mods;
  assists: Assists;
  inputs: ReplayInput[];
}

export function recordReplay(session: RhythmSession, chartHash: string): Replay {
  const keys = new Map<string, number>();
  const inputs = session.inputHistory().map(event => {
    if (!keys.has(event.key)) keys.set(event.key, keys.size);
    return { atMs: event.atMs, action: event.action, key: keys.get(event.key)! };
  });
  const replay: Replay = { version: 2, rulesVersion: RULES_VERSION, chartId: session.chart.id,
    chartHash, mods: { ...session.mods }, assists: { ...session.assists }, inputs };
  validateReplay(replay, session.chart, chartHash);
  return replay;
}

/** The expected hash must come from the trusted map revision, not the submission. */
export function validateReplay(value: unknown, source: ChartSource, expectedHash: string): asserts value is Replay {
  const chart = loadChart(source);
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) throw new Error("Invalid expected chart hash.");
  if (!value || typeof value !== "object") throw new Error("Invalid replay.");
  const replay = value as Partial<Replay>;
  if (replay.version !== 2 || replay.rulesVersion !== RULES_VERSION || replay.chartId !== chart.id ||
      replay.chartHash !== expectedHash || !replay.mods || typeof replay.mods.noFail !== "boolean" ||
      !replay.assists || typeof replay.assists.freezeMotion !== "boolean" || typeof replay.assists.resumed !== "boolean" ||
      typeof replay.mods.autoplay !== "boolean" || !Array.isArray(replay.inputs) || replay.inputs.length > 250000) {
    throw new Error("Replay does not match this map and rules version.");
  }
  const pressed = new Set<number>();
  let previous = -2000;
  for (const event of replay.inputs) {
    if (!event || !Number.isFinite(event.atMs) || event.atMs < previous || event.atMs > chart.durationMs ||
        !Number.isInteger(event.key) || event.key < 0 || event.key > 255 ||
        (event.action !== "press" && event.action !== "release")) throw new Error("Invalid replay input.");
    if ((event.action === "press") === pressed.has(event.key)) throw new Error("Unbalanced replay input.");
    if (event.action === "press") pressed.add(event.key); else pressed.delete(event.key);
    previous = event.atMs;
  }
  if (replay.mods.autoplay && replay.inputs.length) throw new Error("Autoplay cannot contain player inputs.");
}

export class ReplayPlayer {
  session: RhythmSession;
  private index = 0;
  private timeMs = -Infinity;
  private readonly replay: Replay;
  private readonly source: Chart;
  constructor(source: ChartSource, replay: unknown, expectedHash: string) {
    validateReplay(replay, source, expectedHash);
    this.source = loadChart(source);
    this.replay = { ...replay, mods: { ...replay.mods }, assists: { ...replay.assists }, inputs: replay.inputs.map(event => ({ ...event })) };
    this.session = new RhythmSession(this.source, this.replay.mods, this.replay.assists);
  }

  advance(timeMs: number) {
    if (!Number.isFinite(timeMs)) throw new Error("Replay time must be finite.");
    if (timeMs < this.timeMs) {
      this.session = new RhythmSession(this.source, this.replay.mods, this.replay.assists);
      this.index = 0;
    }
    while (this.index < this.replay.inputs.length && this.replay.inputs[this.index].atMs <= timeMs) {
      const event = this.replay.inputs[this.index++];
      this.session[event.action](String(event.key), event.atMs);
    }
    this.session.advance(timeMs);
    this.timeMs = timeMs;
  }
}

export function verifyReplay(source: ChartSource, replay: unknown, expectedHash: string) {
  const player = new ReplayPlayer(source, replay, expectedHash);
  player.advance(player.session.chart.durationMs);
  return player.session.summary();
}
