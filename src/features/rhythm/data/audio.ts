import type { Chart } from "../domain/chart";
import { HitSounds } from "./hitSounds";
import { timeAtBeat, beatAtTime } from "../domain/timing";

type ClockSample = {
  currentTime: number;
  performanceNow: number;
  startTime: number;
  outputLatency: number;
  timestamp?: { contextTime?: number; performanceTime?: number };
};

/** Map a browser input timestamp onto what the output device is playing. */
export function chartTimeAt(sample: ClockSample, eventTime: number): number {
  const stamp = sample.timestamp;
  const outputTime = stamp && stamp.performanceTime !== undefined && stamp.contextTime !== undefined && stamp.performanceTime > 0 && stamp.contextTime > 0 &&
    Math.abs(sample.performanceNow - stamp.performanceTime) < 500
    ? stamp.contextTime + (eventTime - stamp.performanceTime) / 1000
    : sample.currentTime - sample.outputLatency + (eventTime - sample.performanceNow) / 1000;
  return (outputTime - sample.startTime) * 1000;
}

export class RhythmAudio {
  readonly context = new AudioContext({ latencyHint: "interactive" });
  readonly hits = new HitSounds(this.context);
  private source: AudioBufferSourceNode | null = null;
  private readonly gain = this.context.createGain();
  private startTime = 0;
  private generation = 0;

  constructor() { this.gain.connect(this.context.destination); }

  async load(file: File, chart: Chart): Promise<AudioBuffer> {
    if (file.size > 30 * 1024 * 1024) throw new Error("Choose an audio file smaller than 30 MB.");
    const bytes = await file.arrayBuffer();
    if (chart.audioSha256) {
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
      if (hash !== chart.audioSha256) {
        throw new Error("This chart needs the original 88-second audio.mp3 from beatmap set 807850. A different cut or encoding will not match.");
      }
    }
    let buffer: AudioBuffer;
    try { buffer = await this.context.decodeAudioData(bytes); }
    catch { throw new Error("This audio could not be decoded. Try the original MP3 file."); }
    if (buffer.duration * 1000 < chart.audioOffsetMs + chart.durationMs) {
      throw new Error("The recording is shorter than this chart's excerpt.");
    }
    return buffer;
  }

  makeStudy(chart: Chart): AudioBuffer {
    const rate = this.context.sampleRate;
    const buffer = this.context.createBuffer(1, Math.ceil(chart.durationMs / 1000 * rate), rate);
    const samples = buffer.getChannelData(0);
    const tone = (at: number, frequency: number, duration: number, volume: number) => {
      const start = Math.round(at / 1000 * rate), length = Math.round(duration * rate);
      for (let i = 0; i < length && start + i < samples.length; i++) {
        const envelope = Math.min(1, i / (rate * .004)) * Math.exp(-i / rate * 35);
        samples[start + i] += Math.sin(2 * Math.PI * frequency * i / rate) * volume * envelope;
      }
    };
    for (let beat = 0; beat < beatAtTime(chart.timing, chart.durationMs); beat++) tone(timeAtBeat(chart.timing, beat), 160, .08, .16);
    for (const note of chart.notes) {
      tone(note.timeMs, note.kind === "hold" ? 440 : 880, .11, .28);
      if (note.kind === "hold") tone(note.endMs, 660, .1, .22);
    }
    return buffer;
  }

  async start(buffer: AudioBuffer, chart: Chart, volume: number, positionMs = 0, countInMs = 2000): Promise<boolean> {
    if (!Number.isFinite(positionMs) || positionMs < -2500 || positionMs > chart.durationMs + 250 ||
        // Four editor count-in beats at the minimum chart tempo (1 BPM), plus scheduling lead.
        !Number.isFinite(countInMs) || countInMs < 0 || countInMs > 240100 ||
        !Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error("Invalid audio playback position or volume.");
    this.stop();
    const generation = this.generation;
    await this.context.resume();
    if (generation !== this.generation) return false;
    if (this.context.state !== "running") throw new Error("Audio is suspended. Click Start again to enable playback.");
    this.gain.gain.value = volume;
    this.startTime = this.context.currentTime + (countInMs - positionMs) / 1000;
    const from = Math.max(0, positionMs);
    // The chart clock also runs through silent countdowns and calibrated tails.
    if (from < chart.durationMs) {
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.gain);
      source.start(this.startTime + from / 1000, (chart.audioOffsetMs + from) / 1000, (chart.durationMs - from) / 1000);
      this.source = source;
    }
    return true;
  }

  /** Scheduling uses the context clock; input/display timeAt includes output latency. */
  contextTimeAt(chartMs: number): number { return this.startTime + chartMs / 1000; }

  setMusicVolume(volume: number) {
    if (!Number.isFinite(volume) || volume < 0 || volume > 1) throw new Error("Invalid music volume.");
    this.gain.gain.setTargetAtTime(volume, this.context.currentTime, .01);
  }

  timeAt(eventTime = performance.now()): number {
    const now = performance.now();
    // Older WebViews may report epoch-based event timestamps.
    const normalized = eventTime > 1e12 ? eventTime - performance.timeOrigin : eventTime;
    return chartTimeAt({
      currentTime: this.context.currentTime,
      performanceNow: now,
      startTime: this.startTime,
      outputLatency: (this.context.outputLatency || 0) + (this.context.baseLatency || 0),
      timestamp: this.context.getOutputTimestamp?.(),
    }, normalized);
  }

  stop(): void {
    this.generation++;
    this.hits.stop();
    if (this.source) {
      this.source.stop();
      this.source.disconnect();
      this.source = null;
    }
  }

  dispose(): void { this.stop(); void this.context.close(); }
}
