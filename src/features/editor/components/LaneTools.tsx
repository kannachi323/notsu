import { useState } from "react";
import type { Chart } from "../../rhythm/domain/chart";
import { lanePoseAt } from "../../rhythm/domain/chart";
import { presetCounts, presetFrames, transformedFrames } from "../domain/choreography";
import type { GeometryPreset } from "../domain/choreography";
import type { EditorCommand } from "../domain/commands";

export function LaneTools({ chart, selected, select, timeMs, change, seek }: {
  chart: Chart; selected: string[]; select: (ids: string[]) => void; timeMs: number;
  change: (command: EditorCommand) => void; seek: (ms: number) => void;
}) {
  const [preset, setPreset] = useState<GeometryPreset>("triangle");
  const [easing, setEasing] = useState<"keep" | "smooth" | "linear">("keep");
  const lanes = chart.lanes.filter(lane => selected.includes(lane.id)), frames = presetFrames(preset, timeMs);
  const pose = lanes.length === 1 ? lanePoseAt(lanes[0], timeMs) : undefined;
  const times = [...new Set(lanes.flatMap(lane => lane.motion.map(frame => frame.timeMs)))].sort((a, b) => a - b);
  const easingFor = (id: string) => easing === "keep" ? chart.lanes.find(lane => lane.id === id)?.motion.find(frame => frame.timeMs === timeMs)?.easing ?? "smooth" : easing;
  const existingFrames = lanes.map(lane => lane.motion.find(frame => frame.timeMs === timeMs));
  const currentEasings = [...new Set(existingFrames.filter(frame => frame !== undefined).map(frame => frame.easing ?? "smooth"))];
  const applyPreset = () => change({ type: "motion", frames: lanes.map((lane, i) => ({ laneId: lane.id, frame: { ...frames[i], easing: easingFor(lane.id) } })) });
  return <section className="editor-panel" aria-label="Line choreography">
    <h2>Lines <span>{chart.lanes.length}/16</span></h2><p className="editor-hint">Select lines for shared circles and group movement.</p>
    <div className="editor-line-list">{chart.lanes.map((lane, i) => <label key={lane.id}><input type="checkbox" checked={selected.includes(lane.id)}
      onChange={event => select(event.target.checked ? [...selected, lane.id] : selected.filter(id => id !== lane.id))} />Line {i + 1}<span>{chart.notes.filter(note => note.laneIds.includes(lane.id)).length} circles</span></label>)}</div>
    <div className="editor-small-actions"><button onClick={() => select(chart.lanes.map(lane => lane.id))}>Select all</button>
      <button disabled={chart.lanes.length >= 16} onClick={() => { const id = crypto.randomUUID(); change({ type: "add-lane", id, frame: { timeMs: 0, x: .25, y: .3, angle: 0, length: 300 } }); select([id]); }}>Add line</button></div>
    {lanes.length === 1 && chart.lanes.length > 1 && <button className="editor-remove" onClick={() => { change({ type: "delete-lane", id: lanes[0].id }); select([]); }}>Remove selected line &amp; its circles</button>}
    <h3>Geometry</h3><label className="visually-hidden" htmlFor="geometry-preset">Geometric pattern</label>
    <select id="geometry-preset" value={preset} onChange={event => setPreset(event.target.value as GeometryPreset)}>
      <option value="triangle">Triangle · 3 lines</option><option value="square">Square · 4 lines</option><option value="hexagon">Hexagon · 6 lines</option><option value="radial">Radial · 6 lines</option>
    </select>
    <div className="editor-small-actions"><button disabled={chart.lanes.length + presetCounts[preset] > 16} onClick={() => {
      const additions = presetFrames(preset, 0).map(frame => ({ id: crypto.randomUUID(), frame })); change({ type: "add-lanes", lanes: additions }); select(additions.map(lane => lane.id));
    }}>Add pattern</button><button disabled={lanes.length !== presetCounts[preset]} onClick={applyPreset}>Arrange selected</button></div>
    <p className="editor-hint">Arrange {presetCounts[preset]} selected lines at the playhead. Earlier keyframes create the transition.</p>
    {!!lanes.length && <>
      <h3>Movement at {(timeMs / 1000).toFixed(3)} s</h3>
      <label>Arrival easing<select value={easing} onChange={event => setEasing(event.target.value as typeof easing)}><option value="keep">Keep existing · smooth if new</option><option value="smooth">Smooth</option><option value="linear">Linear</option></select></label>
      <p className="editor-hint">Controls the approach into this keyframe. Smooth slows at each end; linear keeps a constant rate. Current: {currentEasings.length > 1 ? "mixed" : currentEasings[0] ?? "no keyframe here"}.</p>
      <button disabled={easing === "keep" || existingFrames.some(frame => !frame)} onClick={() => { if (easing !== "keep") change({ type: "easing", laneIds: selected, timeMs, easing }); }}>Apply easing here</button>
      {pose ? <form key={`${lanes[0].id}:${timeMs}:${JSON.stringify(pose)}`} onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        change({ type: "motion", frames: [{ laneId: lanes[0].id, frame: { timeMs, x: Number(data.get("x")) / 100, y: Number(data.get("y")) / 100,
          angle: Number(data.get("angle")), length: Number(data.get("length")), easing: easingFor(lanes[0].id) } }] });
      }}><div className="editor-field-grid">
        <label>X %<input name="x" type="number" min={0} max={100} step="any" defaultValue={+(pose.x * 100).toFixed(3)} required /></label>
        <label>Y %<input name="y" type="number" min={0} max={100} step="any" defaultValue={+(pose.y * 100).toFixed(3)} required /></label>
        <label>Angle °<input name="angle" type="number" step="any" defaultValue={+pose.angle.toFixed(3)} required /></label>
        <label>Length<input name="length" type="number" min={48} max={420} step="any" defaultValue={+pose.length.toFixed(3)} required /></label>
      </div><button type="submit">Set line keyframe</button></form> : null}
      <form onSubmit={event => {
        event.preventDefault(); const data = new FormData(event.currentTarget);
        const moved = transformedFrames(lanes, timeMs, { rotation: Number(data.get("rotation")), scale: Number(data.get("scale")), dx: Number(data.get("dx")) / 100, dy: Number(data.get("dy")) / 100 });
        change({ type: "motion", frames: lanes.map((lane, i) => ({ laneId: lane.id, frame: { ...moved[i], easing: easingFor(lane.id) } })) });
      }}><div className="editor-field-grid">
        <label>Rotate °<input name="rotation" type="number" defaultValue={45} required /></label><label>Scale<input name="scale" type="number" min={.1} max={4} step={.05} defaultValue={1} required /></label>
        <label>Move X %<input name="dx" type="number" min={-100} max={100} defaultValue={0} required /></label><label>Move Y %<input name="dy" type="number" min={-100} max={100} defaultValue={0} required /></label>
      </div><button type="submit">Set group keyframe</button></form>
      <details><summary>{times.length} keyframes</summary><ul className="editor-time-list">{times.map(time => <li key={time}>
        <button onClick={() => seek(time)}>{(time / 1000).toFixed(3)} s</button>{time > 0 && <button aria-label={`Remove keyframes at ${time} milliseconds`} onClick={() => change({ type: "delete-motion", laneIds: selected, timeMs: time })}>Remove</button>}
      </li>)}</ul></details>
    </>}
  </section>;
}
