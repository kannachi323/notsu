import { useEffect, useRef } from "react";
import { useHomeStore } from "../homeStore";
import { Icon } from "./Icon";

export function MusicDropdown() {
  const open = useHomeStore((state) => state.musicOpen);
  const toggle = useHomeStore((state) => state.toggleMusic);
  const close = useHomeStore((state) => state.closeMusic);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeButton.current?.focus();
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close();
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open, close]);

  useEffect(() => close, [close]);

  return <div className="notsu-music" ref={root} onBlur={(event) => {
    if (event.relatedTarget instanceof Node && !event.currentTarget.contains(event.relatedTarget)) close();
  }}>
    <button ref={trigger} type="button" className={`notsu-icon-button${open ? " is-active" : ""}`} aria-label="Music player" title="Music player" aria-expanded={open} aria-controls="music-player" onClick={toggle}>
      <Icon name="music" />
    </button>
    {open && <section className="notsu-music-card" id="music-player" aria-labelledby="music-title">
      <header className="notsu-music-heading">
        <h2 id="music-title">Music player</h2>
        <button ref={closeButton} type="button" className="notsu-icon-button" aria-label="Close music player" onClick={() => { close(); trigger.current?.focus(); }}><Icon name="close" /></button>
      </header>
      <div className="notsu-track">
        <div className="notsu-track-cover"><Icon name="music" /></div>
        <div><h3>Mou ii kai?</h3><p>THE ORAL CIGARETTES</p></div>
      </div>
      <p className="notsu-music-status">No audio loaded</p>
      <div className="notsu-playback-controls" aria-label="Playback controls">
        <button type="button" className="notsu-icon-button" aria-label="Previous track" disabled><Icon name="previous" /></button>
        <button type="button" className="notsu-icon-button notsu-playback-play" aria-label="Play music" disabled><Icon name="play" /></button>
        <button type="button" className="notsu-icon-button" aria-label="Next track" disabled><Icon name="next" /></button>
      </div>
      <progress className="notsu-track-progress" aria-label="Track progress" max={100} value={0} />
      <div className="notsu-track-time"><span>0:00</span><span>—:—</span></div>
      <label className="notsu-volume"><Icon name="volume" /><span className="visually-hidden">Music volume</span><input type="range" min={0} max={100} defaultValue={60} disabled /></label>
    </section>}
  </div>;
}
