import type { Chart } from "../../rhythm/domain/chart";
import { RhythmAudio } from "../../rhythm/data/audio";
import { beatsInRange, countInPlan } from "../domain/metronome";

export type EditorPlayback = { metronome: boolean; countInBeats: 0 | 2 | 4; musicVolume: number; clickVolume: number };
export const defaultPlayback: EditorPlayback = { metronome: false, countInBeats: 0, musicVolume: .6, clickVolume: .5 };
const LEAD_MS = 60, LOOKAHEAD_MS = 150, TICK_MS = 25;
type Plan = { chart: Chart; fromMs: number; count: ReturnType<typeof countInPlan>; cursor: number };

function validate(options: EditorPlayback) {
  if (typeof options.metronome !== "boolean" || ![0, 2, 4].includes(options.countInBeats) ||
    ![options.musicVolume, options.clickVolume].every(value => Number.isFinite(value) && value >= 0 && value <= 1)) throw new Error("Invalid editor playback settings.");
}

/** Song and click nodes share one clock; UI frames never schedule sounds. */
export class EditorTransport {
  private readonly audio = new RhythmAudio();
  private readonly clickGain = this.context.createGain();
  private buffers: AudioBuffer[] | null = null;
  private voices = new Set<AudioBufferSourceNode>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private plan: Plan | null = null;
  private options = { ...defaultPlayback };
  private generation = 0;
  get context() { return this.audio.context; }
  get running() { return this.plan !== null; }

  constructor(private onFailure: (message: string) => void) { this.clickGain.connect(this.context.destination); }

  async start(buffer: AudioBuffer, chart: Chart, fromMs: number, options: EditorPlayback): Promise<boolean> {
    validate(options); this.stop(); const token = this.generation;
    const count = countInPlan(chart.timing, fromMs, options.countInBeats);
    this.options = { ...options };
    if (!await this.audio.start(buffer, chart, options.musicVolume, fromMs, count.durationMs + LEAD_MS) || token !== this.generation) return false;
    this.audio.setMusicVolume(this.options.musicVolume);
    this.clickGain.gain.value = this.options.clickVolume;
    this.plan = { chart, fromMs, count, cursor: fromMs - count.durationMs };
    this.pump();
    if (!this.plan) return false;
    this.timer = setInterval(() => this.pump(), TICK_MS); return true;
  }

  configure(options: EditorPlayback) {
    validate(options);
    const changedGrid = options.metronome !== this.options.metronome;
    this.options = { ...options };
    this.audio.setMusicVolume(options.musicVolume);
    this.clickGain.gain.setTargetAtTime(options.clickVolume, this.context.currentTime, .01);
    if (changedGrid && this.plan) {
      this.clearVoices();
      // Cancel pending clicks immediately, then rebuild only the future schedule.
      this.plan.cursor = (this.context.currentTime - this.audio.contextTimeAt(0)) * 1000 + 2;
      this.pump();
    }
  }

  sample() {
    if (!this.plan) return { timeMs: 0, remaining: 0 };
    const time = this.audio.timeAt(), { fromMs, count } = this.plan;
    return { timeMs: Math.max(fromMs, time), remaining: Math.min(count.clicks.length, Math.max(0, Math.ceil((fromMs - time - .000001) / count.beatMs))) };
  }

  private pump() {
    const plan = this.plan; if (!plan) return;
    try {
      if (this.context.state !== "running") throw new Error("Audio was suspended. Press Listen to resume from the playhead.");
      const now = (this.context.currentTime - this.audio.contextTimeAt(0)) * 1000;
      // Never replay missed clicks after a main-thread stall, or reschedule an overlap.
      const from = Math.max(plan.cursor, now + 2), through = now + LOOKAHEAD_MS;
      const clicks = plan.count.clicks.filter(timeMs => timeMs >= from && timeMs < through).map(timeMs => ({ timeMs, accent: true }));
      const start = Math.max(plan.fromMs, from), end = Math.min(plan.chart.durationMs, through);
      if (this.options.metronome && start < end) clicks.push(...beatsInRange(plan.chart.timing, start, end));
      for (const click of clicks) this.schedule(click.timeMs, click.accent);
      plan.cursor = Math.max(plan.cursor, through);
    } catch (cause) { this.stop(); this.onFailure(cause instanceof Error ? cause.message : "Metronome playback failed."); }
  }

  private schedule(timeMs: number, accent: boolean) {
    if (!this.buffers) this.buffers = [900, 1350].map(frequency => {
      const rate = this.context.sampleRate, buffer = this.context.createBuffer(1, Math.ceil(rate * .035), rate), samples = buffer.getChannelData(0);
      for (let i = 0; i < samples.length; i++) {
        const t = i / rate, fade = Math.min(1, t / .0015) * Math.max(0, 1 - t / .035);
        samples[i] = .35 * Math.sin(2 * Math.PI * frequency * t) * fade * Math.exp(-t * 80);
      }
      return buffer;
    });
    if (this.voices.size >= 32) throw new Error("Too many pending metronome clicks. Simplify tempo changes or turn the metronome off.");
    const node = this.context.createBufferSource(); node.buffer = this.buffers[accent ? 1 : 0]; node.connect(this.clickGain);
    node.onended = () => { node.onended = null; node.disconnect(); this.voices.delete(node); };
    this.voices.add(node); node.start(this.audio.contextTimeAt(timeMs));
  }

  private clearVoices() {
    for (const node of this.voices) { node.onended = null; node.stop(); node.disconnect(); }
    this.voices.clear();
  }
  stop() {
    this.generation++; this.plan = null;
    if (this.timer !== null) clearInterval(this.timer); this.timer = null;
    this.clearVoices(); this.audio.stop();
  }
  dispose() { this.stop(); this.clickGain.disconnect(); this.audio.dispose(); }
}
