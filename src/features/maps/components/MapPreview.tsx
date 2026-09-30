import { useEffect, useRef, useState } from "react";
import type { LoadedMap } from "../data/package";
import { decodeSong } from "../../../shared/audio/song";
import { loadSettings } from "../../rhythm/data/settings";

export function MapPreview({ selected }: { selected: LoadedMap }) {
  const [state, setState] = useState<"idle" | "loading" | "playing">("idle"), [error, setError] = useState("");
  const context = useRef<AudioContext | null>(null), generation = useRef(0);
  const stop = () => { generation.current++; void context.current?.close(); context.current = null; setState("idle"); };
  useEffect(() => () => { generation.current++; void context.current?.close(); context.current = null; }, []);
  async function toggle() {
    if (state !== "idle") { stop(); return; }
    const token = ++generation.current, clock = new AudioContext(); context.current = clock; setState("loading"); setError("");
    try {
      await clock.resume();
      const song = await decodeSong(new Uint8Array(selected.audio).buffer, selected.set.song.fileName, clock, selected.set.song.sha256, false);
      if (token !== generation.current) return;
      const source = clock.createBufferSource(), gain = clock.createGain(); source.buffer = song.buffer;
      gain.gain.value = loadSettings().volume * .65; source.connect(gain); gain.connect(clock.destination);
      source.onended = () => { if (token === generation.current) stop(); };
      source.start(0, 0, Math.min(15, song.buffer.duration)); setState("playing");
    } catch { if (token === generation.current) { stop(); setError("Preview unavailable. Try Play to hear the full map."); } }
  }
  return <div className="song-preview"><button aria-label={state === "playing" ? "Stop song preview" : state === "loading" ? "Cancel song preview" : "Preview song"} aria-pressed={state === "playing"} onClick={() => void toggle()}>{state === "playing" ? "Ⅱ" : state === "loading" ? "…" : "♫"}<span>Preview</span></button>{error && <p role="alert">{error}</p>}</div>;
}
