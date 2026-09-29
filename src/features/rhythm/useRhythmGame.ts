import { useEffect, useRef, useState } from "react";
import { RhythmAudio } from "./data/audio";
import { chartModes, songChart } from "./data/charts";
import type { ChartMode } from "./data/charts";
import { loadSettings, saveSettings } from "./data/settings";
import type { Settings } from "./data/settings";
import { isGameplayKey } from "./domain/input";
import { RhythmSession } from "./domain/session";
import type { Feedback, Summary } from "./domain/session";
import type { Chart } from "./domain/chart";
import { HitFeedback } from "./components/feedback";
import { getSkin } from "./components/skins";
import { chartFingerprint } from "./data/chartFingerprint";
import { recordReplay, ReplayPlayer } from "./domain/replay";
import type { Replay } from "./domain/replay";
import { DEFAULT_MODS, HIT_WINDOW_MS } from "./domain/rules";
import type { Mods } from "./domain/rules";
import { PauseCheckpoint } from "./domain/pause";
import { initializeSkins, prepareSkin } from "../skins/useSkinCatalog";

export type Phase = "setup" | "starting" | "countdown" | "playing" | "paused" | "rearming" | "resuming" | "results";
export type Runtime = {
  phase: Phase;
  session: RhythmSession;
  timeMs: number;
  audio: RhythmAudio | null;
  settings: Settings;
  feedback: HitFeedback;
  playback?: ReplayPlayer;
  checkpoint?: PauseCheckpoint;
  resumeRemainingMs?: number;
  resumePending?: boolean;
};
type View = { phase: Phase; timeMs: number; summary: Summary; feedback: Feedback | null; countdown: number };

export type LocalLevel = { chart: Chart; buffer: AudioBuffer; editor?: boolean };
export function useRhythmGame(level?: LocalLevel) {
  const initialChart = level?.chart ?? songChart;
  const [settings, setSettings] = useState(loadSettings);
  const [runtime] = useState<{ current: Runtime }>(() => ({ current: {
    phase: "setup", session: new RhythmSession(initialChart), timeMs: 0, audio: null, settings, feedback: new HitFeedback(),
  } }));
  const [chart, setChart] = useState<Chart>(initialChart);
  const [mode, setMode] = useState<ChartMode>("song");
  const [view, setView] = useState<View>({ phase: "setup", timeMs: 0, summary: runtime.current.session.summary(), feedback: null, countdown: 0 });
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const loaded = useRef<AudioBuffer | null>(null);
  const activeBuffer = useRef<AudioBuffer | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);
  const fingerprint = useRef("");
  const lastReplay = useRef<Replay | null>(null);
  const [hasReplay, setHasReplay] = useState(false);

  const publish = () => {
    const current = runtime.current;
    setView({ phase: current.phase, timeMs: current.timeMs, summary: current.session.summary(), feedback: current.session.feedback,
      countdown: Math.max(1, Math.ceil((current.resumeRemainingMs ?? -current.timeMs) / 1000)) });
  };

  const audio = () => runtime.current.audio ??= new RhythmAudio();
  const consumeFeedback = () => {
    const current = runtime.current;
    current.feedback.consume(current.session, getSkin(current.settings.skinId), current.settings.reducedMotion,
      (tone, kind) => current.audio?.hits.play(tone, current.settings.hitVolume, kind));
  };
  const pause = () => {
    const current = runtime.current;
    if (!["starting", "playing", "countdown", "rearming", "resuming"].includes(current.phase)) return;
    generation.current++;
    if (["playing", "countdown"].includes(current.phase)) {
      current.timeMs = Math.max(current.timeMs, current.session.latestInputMs,
        current.audio?.context.state === "running" ? current.audio.timeAt() - current.settings.offsetMs : current.timeMs);
      advanceSession(current.timeMs);
    }
    current.checkpoint = current.phase === "starting" ? undefined : new PauseCheckpoint(current.session, current.timeMs, !!current.playback);
    current.resumeRemainingMs = undefined; current.resumePending = false;
    current.audio?.stop();
    current.feedback.clear();
    current.session.drainJudgements();
    current.phase = "paused";
    publish();
  };

  function advanceSession(time: number) {
    const current = runtime.current;
    if (time < 0) return;
    if (current.playback) {
      current.playback.advance(time); current.session = current.playback.session;
    } else current.session.advance(time);
  }

  function activateResume(time: number) {
    const current = runtime.current;
    if (current.phase !== "resuming" || current.resumePending || !current.checkpoint) return;
    current.resumeRemainingMs = Math.max(0, current.checkpoint.timeMs - time);
    if (current.resumeRemainingMs > 0) return;
    current.checkpoint.complete(time); current.checkpoint = undefined;
    current.resumeRemainingMs = undefined;
    current.phase = time < 0 ? "countdown" : "playing";
  }

  async function resume() {
    const current = runtime.current, checkpoint = current.checkpoint;
    if (!["paused", "rearming"].includes(current.phase) || !checkpoint || !activeBuffer.current || current.session.summary().status !== "playing") return;
    setError("");
    if (!checkpoint.ready) { current.phase = "rearming"; publish(); return; }
    const token = ++generation.current;
    current.phase = "resuming"; current.resumeRemainingMs = 3000; current.resumePending = true; publish();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    try {
      const started = await audio().start(activeBuffer.current, current.session.chart, current.settings.volume,
        checkpoint.timeMs + current.settings.offsetMs, 3000);
      if (!started || !mounted.current || token !== generation.current) return;
      current.resumePending = false;
      if (!document.hasFocus() || document.hidden) pause();
    } catch (cause) {
      if (!mounted.current || token !== generation.current) return;
      current.resumePending = false; current.resumeRemainingMs = undefined; current.phase = "paused";
      setError(cause instanceof Error ? cause.message : "Audio could not resume."); publish();
    }
  }

  useEffect(() => {
    mounted.current = true;
    void initializeSkins();
    let frameId: number;
    let lastPublish = 0;
    const tick = (now: number) => {
      const current = runtime.current;
      if (current.audio && !current.resumePending && ["countdown", "playing", "resuming"].includes(current.phase)) {
        if (current.audio.context.state !== "running") pause();
        else {
          const time = current.audio.timeAt() - current.settings.offsetMs;
          activateResume(time);
          if (current.phase !== "resuming") current.timeMs = Math.max(current.timeMs, time);
          if (current.phase !== "resuming" && current.timeMs >= 0) {
            current.phase = "playing";
            // Rendering reads this state; scoring never depends on a frame's duration.
            advanceSession(current.timeMs);
            consumeFeedback();
            current.feedback.expire(current.timeMs);
          }
          if (current.session.summary().status !== "playing") {
            if (!current.playback) {
              lastReplay.current = recordReplay(current.session, fingerprint.current);
              setHasReplay(true);
            }
            current.audio.stop(); current.feedback.clear(); current.phase = "results";
          }
        }
        if (now - lastPublish >= 50 || current.phase === "results") { publish(); lastPublish = now; }
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    const audioTime = (stamp: number) => runtime.current.audio!.timeAt(stamp) - runtime.current.settings.offsetMs;
    const inputTime = (stamp: number) => Math.max(runtime.current.session.latestInputMs, audioTime(stamp));
    const down = (event: KeyboardEvent) => {
      if (event.code === "Escape") { pause(); return; }
      const current = runtime.current;
      if (current.phase === "resuming") activateResume(audioTime(event.timeStamp));
      if (["paused", "rearming", "resuming"].includes(current.phase)) {
        if (!isGameplayKey(event) || !current.checkpoint?.requiredKeys.includes(event.code)) return;
        event.preventDefault(); current.checkpoint.setKey(event.code, true); publish();
        if (current.phase === "rearming" && current.checkpoint.ready) void resume();
        return;
      }
      if (!["playing", "countdown"].includes(current.phase) || current.playback || !isGameplayKey(event)) return;
      if (event.target instanceof Element && event.target.closest("input, select, textarea, button, a, [contenteditable=true]")) return;
      event.preventDefault();
      const time = inputTime(event.timeStamp);
      if (time < -HIT_WINDOW_MS) return;
      current.session.press(event.code, time);
      consumeFeedback();
    };
    const up = (event: KeyboardEvent) => {
      const current = runtime.current;
      if (current.phase === "resuming") activateResume(audioTime(event.timeStamp));
      if (["paused", "rearming", "resuming"].includes(current.phase)) {
        current.checkpoint?.setKey(event.code, false);
        if (current.phase === "resuming" && !current.checkpoint?.ready) pause();
        else publish();
        return;
      }
      if (["playing", "countdown"].includes(current.phase) && !current.playback) {
        current.session.release(event.code, inputTime(event.timeStamp));
        consumeFeedback();
      }
    };
    const visibility = () => { if (document.hidden) pause(); };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", pause);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      mounted.current = false;
      generation.current++;
      cancelAnimationFrame(frameId);
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", pause);
      document.removeEventListener("visibilitychange", visibility);
      runtime.current.audio?.dispose(); runtime.current.audio = null;
      runtime.current.feedback.clear();
    };
  }, []);

  function updateSettings(next: Settings) {
    setSettings(next); runtime.current.settings = next; saveSettings(next);
    if (next.hitVolume === 0) runtime.current.audio?.hits.stop();
  }

  async function chooseFile(file: File | undefined) {
    if (!file) return;
    const token = ++generation.current;
    setLoading(true); setError("");
    loaded.current = null; setFileName("");
    try {
      const buffer = await audio().load(file, songChart);
      if (!mounted.current || token !== generation.current) return;
      loaded.current = buffer;
      setFileName(file.name); setChart(songChart);
      runtime.current.session = new RhythmSession(songChart); publish();
    } catch (cause) {
      if (mounted.current && token === generation.current) setError(cause instanceof Error ? cause.message : "Could not load audio.");
    } finally {
      if (mounted.current && token === generation.current) setLoading(false);
    }
  }

  async function start(selectedMode: ChartMode = "song", mods: Mods = { ...DEFAULT_MODS }, replay?: Replay) {
    if (["starting", "playing", "countdown", "resuming"].includes(runtime.current.phase)) return;
    const selected = level?.chart ?? chartModes[selectedMode];
    setMode(selectedMode);
    const token = ++generation.current;
    setError("");
    runtime.current.feedback.clear();
    runtime.current.audio?.stop();
    runtime.current.checkpoint = undefined; runtime.current.resumeRemainingMs = undefined; runtime.current.resumePending = false;
    activeBuffer.current = null;
    runtime.current.phase = "starting"; publish();
    try {
      const clock = audio();
      const buffer = level?.buffer ?? (selectedMode === "song" ? loaded.current : clock.makeStudy(selected));
      if (!buffer) throw new Error("Choose your audio file first, or try the timing study.");
      const [hash, assets] = await Promise.all([chartFingerprint(selected), prepareSkin(settings.skinId)]);
      if (!mounted.current || token !== generation.current) return;
      clock.hits.setSamples(assets?.sounds ?? {});
      fingerprint.current = hash;
      runtime.current.playback = replay ? new ReplayPlayer(selected, replay, hash) : undefined;
      runtime.current.session = runtime.current.playback?.session ?? new RhythmSession(selected, mods, { freezeMotion: level?.editor ? false : settings.freezeMotion });
      runtime.current.timeMs = -2000;
      activeBuffer.current = buffer; setChart(selected);
      const started = await clock.start(buffer, selected, settings.volume);
      if (!started || !mounted.current || token !== generation.current) return;
      runtime.current.phase = "countdown";
      if (!document.hasFocus() || document.hidden) { pause(); return; }
      publish();
      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    } catch (cause) {
      if (!mounted.current || token !== generation.current) return;
      runtime.current.phase = "setup"; publish();
      setError(cause instanceof Error ? cause.message : "Audio could not start.");
    }
  }

  function exit() {
    generation.current++; runtime.current.audio?.stop();
    runtime.current.feedback.clear();
    runtime.current.phase = "setup"; runtime.current.timeMs = 0;
    runtime.current.session = new RhythmSession(initialChart);
    runtime.current.playback = undefined;
    runtime.current.checkpoint = undefined; runtime.current.resumeRemainingMs = undefined; runtime.current.resumePending = false;
    activeBuffer.current = null;
    lastReplay.current = null; setHasReplay(false);
    setChart(initialChart); publish();
  }

  const retry = () => start(mode, { ...runtime.current.session.mods });
  const watchReplay = () => lastReplay.current && start(mode, lastReplay.current.mods, lastReplay.current);
  return { runtime, chart, view, settings, updateSettings, fileName, error, loading, chooseFile, start, retry, pause, resume, exit, hasReplay, watchReplay };
}
