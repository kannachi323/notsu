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

export type Phase = "setup" | "starting" | "countdown" | "playing" | "paused" | "results";
export type Runtime = {
  phase: Phase;
  session: RhythmSession;
  timeMs: number;
  audio: RhythmAudio | null;
  settings: Settings;
  feedback: HitFeedback;
};
type View = { phase: Phase; timeMs: number; summary: Summary; feedback: Feedback | null };

export function useRhythmGame() {
  const [settings, setSettings] = useState(loadSettings);
  const runtime = useRef<Runtime>({ phase: "setup", session: new RhythmSession(songChart), timeMs: 0, audio: null, settings, feedback: new HitFeedback() });
  const [chart, setChart] = useState<Chart>(songChart);
  const [mode, setMode] = useState<ChartMode>("song");
  const [view, setView] = useState<View>({ phase: "setup", timeMs: 0, summary: runtime.current.session.summary(), feedback: null });
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const loaded = useRef<AudioBuffer | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);

  const publish = () => {
    const current = runtime.current;
    setView({ phase: current.phase, timeMs: current.timeMs, summary: current.session.summary(), feedback: current.session.feedback });
  };

  const audio = () => runtime.current.audio ??= new RhythmAudio();
  const consumeFeedback = () => {
    const current = runtime.current;
    current.feedback.consume(current.session, getSkin(current.settings.skinId), current.settings.reducedMotion,
      tone => current.audio?.hits.play(tone, current.settings.hitVolume));
  };
  const pause = () => {
    const current = runtime.current;
    if (!["starting", "playing", "countdown"].includes(current.phase)) return;
    generation.current++;
    current.audio?.stop();
    current.feedback.clear();
    current.phase = "paused";
    publish();
  };

  useEffect(() => {
    mounted.current = true;
    let frameId: number;
    let lastPublish = 0;
    const tick = (now: number) => {
      const current = runtime.current;
      if (current.audio && ["countdown", "playing"].includes(current.phase)) {
        if (current.audio.context.state !== "running") pause();
        else {
          current.timeMs = current.audio.timeAt() - current.settings.offsetMs;
          if (current.timeMs >= 0) {
            current.phase = "playing";
            // Rendering reads this state; scoring never depends on a frame's duration.
            current.session.advance(current.timeMs);
            consumeFeedback();
            current.feedback.expire(current.timeMs);
          }
          if (current.timeMs >= current.session.chart.durationMs + 150) {
            current.audio.stop(); current.feedback.clear(); current.phase = "results";
          }
        }
        if (now - lastPublish >= 50 || current.phase === "results") { publish(); lastPublish = now; }
      }
      frameId = requestAnimationFrame(tick);
    };
    frameId = requestAnimationFrame(tick);
    const down = (event: KeyboardEvent) => {
      if (event.code === "Escape") { pause(); return; }
      const current = runtime.current;
      if (current.phase !== "playing" || !isGameplayKey(event)) return;
      if (event.target instanceof Element && event.target.closest("input, select, textarea, button, a, [contenteditable=true]")) return;
      event.preventDefault();
      current.session.press(event.code, current.audio!.timeAt(event.timeStamp) - current.settings.offsetMs);
      consumeFeedback();
    };
    const up = (event: KeyboardEvent) => {
      const current = runtime.current;
      if (current.phase === "playing") {
        current.session.release(event.code, current.audio!.timeAt(event.timeStamp) - current.settings.offsetMs);
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

  async function start(selectedMode: ChartMode = "song") {
    if (["starting", "playing", "countdown"].includes(runtime.current.phase)) return;
    const selected = chartModes[selectedMode];
    setMode(selectedMode);
    const token = ++generation.current;
    setError("");
    runtime.current.feedback.clear();
    runtime.current.audio?.hits.stop();
    runtime.current.phase = "starting"; publish();
    try {
      const clock = audio();
      const buffer = selectedMode === "song" ? loaded.current : clock.makeStudy(selected);
      if (!buffer) throw new Error("Choose your audio file first, or try the timing study.");
      await clock.start(buffer, selected, settings.volume);
      if (!mounted.current || token !== generation.current) { clock.stop(); return; }
      if (!document.hasFocus() || document.hidden) { clock.stop(); runtime.current.phase = "paused"; publish(); return; }
      runtime.current.session = new RhythmSession(selected);
      runtime.current.timeMs = -2000;
      runtime.current.phase = "countdown";
      setChart(selected); publish();
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
    runtime.current.session = new RhythmSession(songChart);
    setChart(songChart); publish();
  }

  const retry = () => start(mode);
  return { runtime, chart, view, settings, updateSettings, fileName, error, loading, chooseFile, start, retry, pause, exit };
}
