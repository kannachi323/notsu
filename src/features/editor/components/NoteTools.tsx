import { useState } from "react";
import type { Chart } from "../../rhythm/domain/chart";
import type { EditorCommand } from "../domain/commands";
import { beatAtTime, timeAtBeat } from "../../rhythm/domain/timing";
export function NoteTools({ chart, selected, noteIds, selectNotes, timeMs, divisor, change, seek }: { chart: Chart; selected: string[]; noteIds: string[]; selectNotes: (ids: string[]) => void; timeMs: number; divisor: number; change: (command: EditorCommand) => void; seek: (ms: number) => void }) {
  const [beats, setBeats] = useState(1);
  const tempo = [...chart.timing].reverse().find(point => point.timeMs <= timeMs)!;
  const near = chart.notes.filter(note => (note.kind === "hold" ? note.endMs : note.timeMs) >= timeMs - 1000).slice(0, 10);
  return <section className="editor-panel" aria-label="Circle placement"><h2>Circles <span>{chart.notes.length}</span></h2>
    <p className="editor-hint">{selected.length ? `${selected.length} selected ${selected.length === 1 ? "line" : "lines"}. One press judges every shared circle together.` : "Select at least one line."}</p>
    <button className="primary" disabled={!selected.length} onClick={() => change({ type: "place", id: crypto.randomUUID(), timeMs, divisor, laneIds: selected })}>Add tap at playhead</button>
    <label>Hold length · beats<input type="number" min={.125} max={64} step={.125} value={beats} onChange={event => setBeats(Number(event.target.value))} /></label>
    <button disabled={!selected.length || !Number.isFinite(beats) || beats <= 0} onClick={() => change({ type: "place", id: crypto.randomUUID(), timeMs, endMs: timeAtBeat(chart.timing, beatAtTime(chart.timing, timeMs) + beats), divisor, laneIds: selected })}>Add hold at playhead</button>
    <h3>Near the playhead</h3>{!near.length && <p className="editor-hint">No circles here yet.</p>}
    <ul className="editor-note-list">{near.map(note => <li key={note.id}>
      <input type="checkbox" aria-label={`Select circle at ${note.timeMs} milliseconds`} checked={noteIds.includes(note.id)} onChange={event => selectNotes(event.target.checked ? [...noteIds, note.id] : noteIds.filter(id => id !== note.id))} />
      <button className="editor-note-time" onClick={() => seek(note.timeMs)}><strong>{(note.timeMs / 1000).toFixed(3)} s</strong><span>{note.kind === "hold" ? `Hold → ${(note.endMs / 1000).toFixed(3)} s` : "Tap"} · {note.laneIds.length} {note.laneIds.length === 1 ? "line" : "lines"}</span></button>
      <button aria-label={`Remove circle at ${note.timeMs} milliseconds`} onClick={() => change({ type: "delete-note", id: note.id })}>×</button>
    </li>)}</ul>
    <details><summary>Tempo changes</summary><form key={`${tempo.timeMs}:${tempo.bpm}`} onSubmit={event => { event.preventDefault(); const bpm = Number(new FormData(event.currentTarget).get("bpm")); change({ type: "tempo", timeMs, bpm }); }}>
      <label>BPM at playhead<input name="bpm" type="number" min={1} max={1000} step="any" defaultValue={tempo.bpm} required /></label><button>Set tempo</button>
    </form><p className="editor-hint">Tempo changes adjust the grid. Existing circles keep their audio times.</p><ul className="editor-time-list">{chart.timing.map(point => <li key={point.timeMs}>
      <button onClick={() => seek(point.timeMs)}>{(point.timeMs / 1000).toFixed(3)} s · {point.bpm} BPM</button>{point.timeMs > 0 && <button aria-label={`Remove tempo at ${point.timeMs} milliseconds`} onClick={() => change({ type: "delete-tempo", timeMs: point.timeMs })}>Remove</button>}
    </li>)}</ul></details>
  </section>;
}
