import { expect, it, vi } from "vitest";
import { HitSounds, MAX_SOUND_VOICES } from "./hitSounds";
import { getSkin } from "../components/skins";
import { RhythmAudio } from "./audio";

function mockContext() {
  const param = () => ({setValueAtTime:vi.fn(),linearRampToValueAtTime:vi.fn(),exponentialRampToValueAtTime:vi.fn()});
  return {state:"running",currentTime:1,destination:{},close:vi.fn(),
    createOscillator:vi.fn(() => ({frequency:param(),connect:vi.fn(),disconnect:vi.fn(),start:vi.fn(),stop:vi.fn(),onended:null as (()=>void)|null})),
    createGain:vi.fn(() => ({gain:param(),connect:vi.fn(),disconnect:vi.fn()})),
  };
}
const tone = getSkin("midnight").sounds.tap;
it("does not allocate voices when muted or suspended", () => {
  const context = mockContext(), sounds = new HitSounds(context as unknown as AudioContext);
  sounds.play(tone,0); sounds.play(tone,NaN); context.state="suspended"; sounds.play(tone,.15);
  expect(context.createOscillator).not.toHaveBeenCalled(); expect(sounds.activeVoices).toBe(0);
});
it("applies hit volume to the envelope and releases ended nodes", () => {
  const context = mockContext(), sounds = new HitSounds(context as unknown as AudioContext);
  sounds.play(tone,.15);
  expect(context.createGain.mock.results[0].value.gain.linearRampToValueAtTime).toHaveBeenCalledWith(tone.gain*.15,1.003);
  const oscillator = context.createOscillator.mock.results[0].value;
  oscillator.onended!(); expect(sounds.activeVoices).toBe(0);
  expect(oscillator.disconnect).toHaveBeenCalledOnce(); expect(oscillator.onended).toBeNull();
});
it("caps overlapping voices, stops/disconnects them, and supports repeated cleanup", () => {
  const context = mockContext(), sounds = new HitSounds(context as unknown as AudioContext);
  for(let i=0;i<20;i++) sounds.play(tone,.15);
  expect(sounds.activeVoices).toBe(MAX_SOUND_VOICES);
  expect(context.createOscillator.mock.results[0].value.stop).toHaveBeenCalledTimes(2);
  sounds.stop(); sounds.stop(); expect(sounds.activeVoices).toBe(0);
  for(const node of context.createOscillator.mock.results) expect(node.value.disconnect).toHaveBeenCalledOnce();
});
it("stops hit voices with music on pause/exit and disposal", () => {
  const context = mockContext();
  vi.stubGlobal("AudioContext",class { constructor(){return context;} });
  try {
    const audio = new RhythmAudio(); audio.hits.play(tone,.15); audio.stop();
    expect(audio.hits.activeVoices).toBe(0);
    audio.hits.play(tone,.15); audio.dispose();
    expect(audio.hits.activeVoices).toBe(0); expect(context.close).toHaveBeenCalledOnce();
  } finally { vi.unstubAllGlobals(); }
});
it("prepares custom samples once, uses synthesis for missing sounds, and shares the voice cap", () => {
  const context = { ...mockContext(),
    createBuffer: vi.fn((_channels: number, frames: number, rate: number) => ({ duration: frames / rate, copyToChannel: vi.fn() })),
    createBufferSource: vi.fn(() => ({ buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null as (()=>void)|null })),
  };
  const sounds = new HitSounds(context as unknown as AudioContext);
  sounds.setSamples({ tap: { sampleRate: 48000, channels: [new Float32Array(4800).fill(.2)] } });
  sounds.play(tone, 0); expect(context.createBufferSource).not.toHaveBeenCalled();
  for (let i = 0; i < 20; i++) sounds.play(tone, .15, i % 2 ? "tap" : "release");
  expect(context.createBuffer).toHaveBeenCalledOnce();
  expect(context.createBufferSource).toHaveBeenCalledTimes(10); expect(context.createOscillator).toHaveBeenCalledTimes(10);
  expect(sounds.activeVoices).toBe(MAX_SOUND_VOICES);
  sounds.stop(); expect(sounds.activeVoices).toBe(0);
  for (const node of context.createBufferSource.mock.results) expect(node.value.disconnect).toHaveBeenCalledOnce();
  sounds.setSamples({}); sounds.play(tone, .15); expect(context.createOscillator).toHaveBeenCalledTimes(11);
});
