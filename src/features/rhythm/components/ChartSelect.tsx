import { useState } from "react";
import { chartModes } from "../data/charts";
import type { ChartMode } from "../data/charts";
import { DEFAULT_MODS } from "../domain/rules";
import type { Mods } from "../domain/rules";

interface Props {
  fileName: string;
  loading: boolean;
  error: string;
  chooseFile: (file: File | undefined) => void;
  start: (mode?: ChartMode, mods?: Mods) => void;
  freezeMotion?: boolean;
}
const choices: { mode: ChartMode; title: string; detail: string; description: string }[] = [
  { mode: "basic", title: "Timing study", detail: "Introduction", description: "A short introduction to taps and holds. Synthesized audio is included." },
  { mode: "geometry", title: "Moving together", detail: "Four moving lines", description: "Read a rotating square, alternate between lines, and hit shared circles with one press. Synthesized audio is included." },
  { mode: "rhythms", title: "Two-hand rhythm drill", detail: "Practice", description: "Triplets, dotted rhythms, sixteenth rolls, and taps during holds. Synthesized audio is included." },
  { mode: "song", title: "Mou Ii Kai?", detail: "The Oral Cigarettes", description: "A 40-second challenge with fast rolls and hold patterns. This is an original beat-grid study, not a finished transcription." },
];

export function ChartSelect({ fileName, loading, error, chooseFile, start, freezeMotion = false }: Props) {
  const [selected, setSelected] = useState<ChartMode>(fileName ? "song" : "basic");
  const [mods, setMods] = useState<Mods>({ ...DEFAULT_MODS });
  const choice = choices.find(choice => choice.mode === selected)!;
  const chart = chartModes[selected];
  return <div className="chart-select">
    <fieldset className="chart-list">
      <legend className="visually-hidden">Choose a chart</legend>
      {choices.map(choice => <label key={choice.mode} className={`chart-choice ${selected === choice.mode ? "selected" : ""}`}>
        <input type="radio" name="chart" value={choice.mode} checked={selected === choice.mode} onChange={() => setSelected(choice.mode)} />
        <span><strong>{choice.title}</strong><span>{choice.detail}</span></span>
      </label>)}
    </fieldset>
    <section className="chart-details" aria-labelledby="chart-title">
      <h2 id="chart-title">{choice.title}</h2>
      <p className="chart-meta">{chart.timing[0].bpm} BPM <span aria-hidden="true">·</span> {Math.round(chart.durationMs / 1000)} seconds <span aria-hidden="true">·</span> {chart.lanes.length} {chart.lanes.length === 1 ? "line" : "lines"}</p>
      <p>{choice.description}</p>
      {selected === "song" && <div className="song-picker">
        <label htmlFor="song-file">Audio file</label>
        <input id="song-file" type="file" accept=".mp3,audio/mpeg" disabled={loading} aria-describedby="audio-help"
          onChange={event => { chooseFile(event.target.files?.[0]); event.target.value = ""; }} />
        <p id="audio-help">Choose audio.mp3 from the 88-second cut in beatmap set 807850. The file stays on your device.</p>
        {loading && <p role="status">Reading audio…</p>}
        {fileName && <p className="file-ready" role="status">Ready: {fileName}</p>}
      </div>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <fieldset className="mod-options"><legend>Play options</legend>
        <label><input type="checkbox" checked={mods.noFail} onChange={event => setMods({ ...mods, noFail: event.target.checked })} /> No Fail</label>
        <label><input type="checkbox" checked={mods.autoplay} onChange={event => setMods({ ...mods, autoplay: event.target.checked })} /> Autoplay</label>
        {freezeMotion && <p>Freeze line movement is enabled in Settings.</p>}
        {(mods.noFail || mods.autoplay || freezeMotion) && <p>Practice and demonstrations do not count toward rankings.</p>}
      </fieldset>
      <button className="primary chart-start" disabled={loading || (selected === "song" && !fileName)} onClick={() => start(selected, mods)}>{mods.autoplay ? "Watch" : "Play"}</button>
    </section>
  </div>;
}
