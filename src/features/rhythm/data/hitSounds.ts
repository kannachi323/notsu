import type { Tone } from "../components/skins";

export const MAX_SOUND_VOICES = 8;
type Voice = { oscillator: OscillatorNode; envelope: GainNode };

/** Short, bounded one-shot voices. No connection to the music volume bus. */
export class HitSounds {
  private voices: Voice[] = [];
  constructor(private context: AudioContext) {}
  get activeVoices() { return this.voices.length; }

  play(tone: Tone, volume: number) {
    if (!Number.isFinite(volume) || volume <= 0 || this.context.state !== "running") return;
    while (this.voices.length >= MAX_SOUND_VOICES) this.remove(this.voices[0], true);
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const envelope = this.context.createGain();
    const voice = { oscillator, envelope };
    oscillator.type = tone.wave;
    oscillator.frequency.setValueAtTime(tone.frequency, now);
    oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, now + tone.duration);
    envelope.gain.setValueAtTime(0, now);
    envelope.gain.linearRampToValueAtTime(tone.gain * Math.min(1, volume), now + .003);
    envelope.gain.exponentialRampToValueAtTime(.0001, now + tone.duration);
    envelope.gain.linearRampToValueAtTime(0, now + tone.duration + .005);
    oscillator.connect(envelope); envelope.connect(this.context.destination);
    oscillator.onended = () => this.remove(voice, false);
    this.voices.push(voice);
    oscillator.start(now); oscillator.stop(now + tone.duration + .006);
  }

  stop() { for (const voice of [...this.voices]) this.remove(voice, true); }

  private remove(voice: Voice, stop: boolean) {
    voice.oscillator.onended = null;
    if (stop) voice.oscillator.stop();
    voice.oscillator.disconnect(); voice.envelope.disconnect();
    this.voices = this.voices.filter(item => item !== voice);
  }
}
