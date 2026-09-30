import { useState } from "react";
import type { Chart, ChartNote } from "../../rhythm/domain/chart";
import type { EditorCommand } from "../domain/commands";
import { copyPhrase } from "../domain/noteEditing";
import type { NotePhrase } from "../domain/noteEditing";

function NoteInspector({ chart, note, change }: { chart: Chart; note: ChartNote; change: (command: EditorCommand) => boolean }) {
  const [hold, setHold] = useState(note.kind === "hold");
  return <form className="editor-note-inspector" onSubmit={event => {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    change({ type: "edit-note", id: note.id, timeMs: Number(data.get("start")),
      ...(hold ? { endMs: Number(data.get("end")) } : {}), laneIds: data.getAll("line").map(String) });
  }}>
    <div className="editor-field-grid"><label>Circle type<select value={hold ? "hold" : "tap"} onChange={event => setHold(event.target.value === "hold")}><option value="tap">Tap</option><option value="hold">Hold</option></select></label>
      <label>Start · ms<input name="start" type="number" min={0} max={chart.durationMs} step="any" defaultValue={note.timeMs} required /></label>
      {hold && <label>End · ms<input name="end" type="number" min={0} max={chart.durationMs} step="any" defaultValue={note.kind === "hold" ? note.endMs : note.timeMs + 500} required /></label>}</div>
    <fieldset><legend>Shared lines</legend><div className="editor-note-lanes">{chart.lanes.map((lane, index) => <label key={lane.id}><input type="checkbox" name="line" value={lane.id} defaultChecked={note.laneIds.includes(lane.id)} />Line {index + 1}</label>)}</div></fieldset>
    <button type="submit">Apply circle changes</button><p className="editor-hint">Exact times are preserved. Use Snap selection to align both endpoints to the beat grid.</p>
  </form>;
}

export function NoteSelection({ chart, ids, select, laneIds, timeMs, divisor, change }: {
  chart: Chart; ids: string[]; select: (ids: string[]) => void; laneIds: string[]; timeMs: number; divisor: number; change: (command: EditorCommand) => boolean;
}) {
  const [clipboard, setClipboard] = useState<NotePhrase | null>(null), [notice, setNotice] = useState("");
  const [amount, setAmount] = useState(1), [unit, setUnit] = useState<"beats" | "ms">("beats");
  const [rangeStart, setRangeStart] = useState(0), [rangeEnd, setRangeEnd] = useState(chart.durationMs);
  const wanted = new Set(ids), notes = chart.notes.filter(note => wanted.has(note.id));
  const changeSelection = (command: EditorCommand) => { const success = change(command); setNotice(success ? "Selection updated. Undo restores the previous edit." : "Edit could not be applied. Your circles are unchanged; see the error above."); return success; };
  return <section className="editor-selection" aria-label="Selected circles"><h2>Selection <span>{ids.length} {ids.length === 1 ? "circle" : "circles"}</span></h2>
    <div className="editor-small-actions"><button disabled={!chart.notes.length} onClick={() => select(chart.notes.map(note => note.id))}>Select all circles</button><button disabled={!ids.length} onClick={() => select([])}>Clear selection</button>
      <button disabled={!ids.length} onClick={() => { setClipboard(copyPhrase(chart, ids)); setNotice(`Copied ${ids.length} circles. Paste keeps their beat spacing and shared lines.`); }}>Copy phrase</button>
      <button disabled={!clipboard} onClick={() => { if (!clipboard) return; const added = clipboard.map(() => crypto.randomUUID());
        if (changeSelection({ type: "paste-notes", phrase: clipboard, ids: added, timeMs, divisor })) select(added);
      }}>Paste at playhead{clipboard ? ` (${clipboard.length})` : ""}</button></div>
    <details><summary>Select a time range</summary><form className="editor-range" onSubmit={event => { event.preventDefault(); select(chart.notes.filter(note => note.timeMs >= rangeStart && note.timeMs <= rangeEnd).map(note => note.id)); }}>
      <label>From · ms<input type="number" min={0} max={chart.durationMs} step="any" value={rangeStart} onChange={event => setRangeStart(Number(event.target.value))} required /></label>
      <label>Through · ms<input type="number" min={rangeStart} max={chart.durationMs} step="any" value={rangeEnd} onChange={event => setRangeEnd(Number(event.target.value))} required /></label><button>Select range</button></form>
      <p className="editor-hint">Includes circles whose starts fall inside the range, on every line.</p></details>
    {!!ids.length && <><div className="editor-nudge"><label>Move by<input type="number" min={.001} step="any" value={amount} onChange={event => setAmount(Number(event.target.value))} /></label>
      <label>Unit<select value={unit} onChange={event => setUnit(event.target.value as "beats" | "ms")}><option value="beats">Beats</option><option value="ms">Milliseconds</option></select></label>
      <button disabled={!Number.isFinite(amount) || amount <= 0} onClick={() => changeSelection({ type: "move-notes", ids, amount: -amount, unit })}>Earlier</button><button disabled={!Number.isFinite(amount) || amount <= 0} onClick={() => changeSelection({ type: "move-notes", ids, amount, unit })}>Later</button></div>
      <p className="editor-hint">Beats follow tempo changes; milliseconds keep exact spacing. Each move includes hold ends.</p>
      <div className="editor-small-actions"><button onClick={() => changeSelection({ type: "snap-notes", ids, divisor })}>Snap selection</button>
        <button disabled={!laneIds.length} onClick={() => changeSelection({ type: "assign-note-lanes", ids, laneIds })}>Use selected lines</button>
        <button onClick={() => changeSelection({ type: "delete-notes", ids })}>Delete selection</button></div>
      {notes.length === 1 && <NoteInspector key={JSON.stringify(notes[0])} chart={chart} note={notes[0]} change={changeSelection} />}
    </>}
    {!ids.length && <p className="editor-hint">Click a circle in the timeline, or select circles from the list. Shift-click adds to your selection.</p>}
    <p role="status" className="editor-selection-status">{notice}</p>
  </section>;
}
