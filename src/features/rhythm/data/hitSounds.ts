import type { Tone } from "../components/skins";
import type { SoundName } from "../../skins/domain/manifest";
import type { PcmSound } from "../../skins/data/wav";

export const MAX_SOUND_VOICES = 8;
type Voice = { source: OscillatorNode | AudioBufferSourceNode; envelope: GainNode };

/** Short, bounded one-shot voices. No connection to the music volume bus. */
export class HitSounds {
  private voices: Voice[] = [];
  private samples: Partial<Record<SoundName, AudioBuffer>> = {};
  constructor(private context: AudioContext) {}
  get activeVoices() { return this.voices.length; }

  /** Decode once before play; input handling only schedules already prepared buffers. */
  setSamples(samples: Partial<Record<SoundName, PcmSound>>) {
    this.stop(); this.samples = {};
    for (const kind of ["tap", "release"] as const) {
      const sample = samples[kind]; if (!sample) continue;
      const buffer = this.context.createBuffer(sample.channels.length, sample.channels[0].length, sample.sampleRate);
      sample.channels.forEach((channel, index) => buffer.copyToChannel(new Float32Array(channel), index));
      this.samples[kind] = buffer;
    }
  }

  play(tone: Tone, volume: number, kind: SoundName = "tap") {
    if (!Number.isFinite(volume) || volume <= 0 || this.context.state !== "running") return;
    while (this.voices.length >= MAX_SOUND_VOICES) this.remove(this.voices[0], true);
    const now = this.context.currentTime, sample = this.samples[kind];
    const envelope = this.context.createGain();
    let source: OscillatorNode | AudioBufferSourceNode;
    let duration: number;
    if (sample) {
      const player = this.context.createBufferSource(); player.buffer = sample; source = player;
      duration = sample.duration;
      // A short boundary fade prevents clicks even for files with abrupt edges.
      const fade = Math.min(.003, duration / 3);
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(Math.min(1, volume), now + fade);
      envelope.gain.setValueAtTime(Math.min(1, volume), now + duration - fade);
      envelope.gain.linearRampToValueAtTime(0, now + duration);
    } else {
      const oscillator = this.context.createOscillator(); source = oscillator;
      oscillator.type = tone.wave;
      oscillator.frequency.setValueAtTime(tone.frequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, now + tone.duration);
      envelope.gain.setValueAtTime(0, now);
      envelope.gain.linearRampToValueAtTime(tone.gain * Math.min(1, volume), now + .003);
      envelope.gain.exponentialRampToValueAtTime(.0001, now + tone.duration);
      envelope.gain.linearRampToValueAtTime(0, now + tone.duration + .005);
      duration = tone.duration + .006;
    }
    const voice = { source, envelope };
    source.connect(envelope); envelope.connect(this.context.destination);
    source.onended = () => this.remove(voice, false);
    this.voices.push(voice); source.start(now); source.stop(now + duration);
  }

  stop() { for (const voice of [...this.voices]) this.remove(voice, true); }

  private remove(voice: Voice, stop: boolean) {
    voice.source.onended = null;
    if (stop) voice.source.stop();
    voice.source.disconnect(); voice.envelope.disconnect();
    this.voices = this.voices.filter(item => item !== voice);
  }
}
