import { useEffect, useRef, useState } from "react";
import { useHomeStore } from "../homeStore";
import { Icon, IconButton, Notice } from "../../../shared/components";
import { starterFile, starterMaps } from "../../maps/data/starters";
import { mapJob } from "../../maps/data/packageClient";
import type { LoadedMap } from "../../maps/data/package";
import { loadSettings } from "../../rhythm/data/settings";

export function MusicDropdown() {
  const open = useHomeStore(state => state.musicOpen), toggle = useHomeStore(state => state.toggleMusic), close = useHomeStore(state => state.closeMusic);
  const root = useRef<HTMLDivElement>(null), trigger = useRef<HTMLButtonElement>(null), closeButton = useRef<HTMLButtonElement>(null);
  const audio = useRef<AudioContext | null>(null), generation = useRef(0);
  const [index, setIndex] = useState(0), [state, setState] = useState<"idle" | "loading" | "playing">("idle"), [error, setError] = useState("");
  const track = starterMaps[index];
  function stop() { generation.current++; void audio.current?.close(); audio.current = null; setState("idle"); }
  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const dismiss = (event: PointerEvent) => { if (event.target instanceof Node && !root.current?.contains(event.target)) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", dismiss); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", dismiss); document.removeEventListener("keydown", escape); };
  }, [open, close]);
  useEffect(() => () => { close(); generation.current++; void audio.current?.close(); }, [close]);
  async function play() {
    if (state !== "idle") { stop(); return; }
    const token = ++generation.current, context = new AudioContext(); audio.current = context; setState("loading"); setError("");
    try {
      await context.resume();
      const response = await fetch(`${import.meta.env.BASE_URL}maps/${starterFile(track.revision)}`, { credentials:"omit", signal:AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error();
      const loaded = await mapJob<LoadedMap>({ action:"unpack", bytes:new Uint8Array(await response.arrayBuffer()) });
      if (token !== generation.current) return;
      const buffer = await context.decodeAudioData(new Uint8Array(loaded.audio).buffer);
      if (token !== generation.current) return;
      const source = context.createBufferSource(), gain = context.createGain();
      source.buffer = buffer; gain.gain.value = loadSettings().volume; source.connect(gain); gain.connect(context.destination);
      source.onended = () => { if (token === generation.current) stop(); };
      source.start(); setState("playing");
    } catch { if (token === generation.current) { stop(); setError("This song could not play. Check your audio output and retry."); } }
  }
  function change(delta: number) { stop(); setError(""); setIndex((index + delta + starterMaps.length) % starterMaps.length); }
  return <div className="music-player" ref={root} onBlur={event => { if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) close(); }}>
    <button ref={trigger} type="button" className="toolbar-button" aria-label="Music player" title="Music player" aria-expanded={open} aria-controls="music-player" onClick={toggle}><Icon name="music" /></button>
    {open && <section className="ui-popover music-card" id="music-player" aria-labelledby="music-title">
      <header className="music-card-heading"><h2 id="music-title">Now playing</h2><IconButton ref={closeButton} size="sm" label="Close music player" icon={<Icon name="close" />} onClick={() => { close(); trigger.current?.focus(); }} /></header>
      <div className="music-track"><div className="music-track-cover" aria-hidden="true"><Icon name="music" /></div><div><h3>{track.title}</h3><p>{track.artist}</p></div></div>
      <div className="music-controls" aria-label="Playback controls">
        <IconButton label="Previous track" icon={<Icon name="previous" />} onClick={() => change(-1)} />
        <IconButton variant="primary" size="lg" className="music-play" label={state === "idle" ? "Play music" : "Stop music"} icon={<Icon name={state === "idle" ? "play" : "pause"} />} onClick={() => void play()} />
        <IconButton label="Next track" icon={<Icon name="next" />} onClick={() => change(1)} />
      </div>
      <p className="music-status" role="status">{state === "playing" ? "Playing included music" : state === "loading" ? "Loading song…" : "Included music · ready to play"}</p>
      {error && <Notice tone="danger" role="alert">{error}</Notice>}
    </section>}
  </div>;
}
