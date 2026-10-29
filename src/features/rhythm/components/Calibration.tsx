import { useEffect, useRef, useState } from "react";
import { Button, Icon } from "../../../shared/components";
import { chartTimeAt } from "../data/audio";
import { calibrationOffset } from "../domain/calibration";
import { isGameplayKey } from "../domain/input";

const INTERVAL_MS = 600, COUNT_IN = 4, BEATS = 16, LEAD_MS = 400;
const clicks = Array.from({ length: BEATS }, (_, i) => i * INTERVAL_MS);
type Run = { context: AudioContext; startTime: number; taps: number[] };

/** Tap along to clicks; taps use the same output-clock mapping as gameplay input. */
export function Calibration({ volume, offsetMs, apply }: { volume: number; offsetMs: number; apply: (offsetMs: number) => void }) {
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [tapped, setTapped] = useState(0);
  const [result, setResult] = useState<number | null>(null);
  const run = useRef<Run | null>(null);
  const pad = useRef<HTMLButtonElement>(null);

  const stop = () => { const current = run.current; run.current = null; if (current) void current.context.close(); };
  useEffect(() => stop, []);

  const tap = (eventTime: number) => {
    const current = run.current; if (!current) return;
    const { context } = current;
    const at = chartTimeAt({ currentTime: context.currentTime, performanceNow: performance.now(), startTime: current.startTime,
      outputLatency: (context.outputLatency || 0) + (context.baseLatency || 0), timestamp: context.getOutputTimestamp?.() }, eventTime);
    if (at < (COUNT_IN - .5) * INTERVAL_MS) return;
    current.taps.push(at); setTapped(current.taps.length);
  };

  useEffect(() => {
    if (phase !== "running") return;
    const down = (event: KeyboardEvent) => {
      if (!isGameplayKey(event) || (event.target instanceof Element && event.target.closest("input, select, textarea"))) return;
      event.preventDefault(); tap(event.timeStamp);
    };
    const timer = setTimeout(() => {
      const current = run.current; if (!current) return;
      setResult(calibrationOffset(current.taps, clicks.slice(COUNT_IN), INTERVAL_MS)); setPhase("done"); stop();
    }, LEAD_MS + BEATS * INTERVAL_MS + 400);
    window.addEventListener("keydown", down);
    return () => { clearTimeout(timer); window.removeEventListener("keydown", down); };
  }, [phase]);

  async function start() {
    stop();
    const context = new AudioContext({ latencyHint: "interactive" });
    await context.resume();
    const startTime = context.currentTime + LEAD_MS / 1000;
    for (const [index, at] of clicks.entries()) {
      const when = startTime + at / 1000, oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.frequency.value = index < COUNT_IN ? 660 : 990;
      gain.gain.setValueAtTime(0, when); gain.gain.linearRampToValueAtTime(Math.max(.05, volume), when + .002);
      gain.gain.exponentialRampToValueAtTime(.0001, when + .08);
      oscillator.connect(gain).connect(context.destination); oscillator.start(when); oscillator.stop(when + .1);
    }
    run.current = { context, startTime, taps: [] };
    setTapped(0); setResult(null); setPhase("running"); pad.current?.focus();
  }

  const measured = BEATS - COUNT_IN;
  return <div className="calibration">
    <button ref={pad} type="button" className={`calibration-pad ${phase}`} disabled={phase !== "running"}
      onPointerDown={event => { event.preventDefault(); tap(event.timeStamp); }}
      aria-label={phase === "running" ? "Tap on each high click" : "Calibration pad"}>
      <span className="calibration-ring" aria-hidden="true" />
      <span className="calibration-count" aria-live="polite">
        {phase === "running" ? `${Math.min(tapped, measured)} / ${measured}` : phase === "done" && result !== null ? `${result > 0 ? "+" : ""}${result} ms` : <Icon name="music" />}
      </span>
    </button>
    <div className="calibration-copy">
      {phase === "idle" && <p>Tap any key on each high click.</p>}
      {phase === "running" && <p>Four low clicks, then tap along.</p>}
      {phase === "done" && <p role="status">{result === null ? "Not enough taps on the beat. Try again." : `Current ${offsetMs > 0 ? "+" : ""}${offsetMs} ms`}</p>}
      <div className="ui-cluster">
        {phase === "done" && result !== null && result !== offsetMs && <Button size="sm" variant="primary" icon={<Icon name="check" />} onClick={() => { apply(result); setPhase("idle"); }}>Use {result > 0 ? "+" : ""}{result} ms</Button>}
        <Button size="sm" icon={<Icon name={phase === "done" ? "refresh" : "start"} />} disabled={phase === "running"} onClick={() => void start()}>{phase === "done" ? "Again" : "Calibrate"}</Button>
      </div>
    </div>
  </div>;
}
