import { useEffect, useMemo, useRef, useState } from "react";
import type { Chart, ChartNote } from "../../rhythm/domain/chart";
import { snapTime } from "../../rhythm/domain/timing";
import type { EditorCommand } from "../domain/commands";

type Drag = { pointer: number; x: number; anchor: number; note: ChartNote; tail: boolean; ids: string[]; delta: number; moved: boolean };

export function Timeline({ chart, peaks, timeMs, divisor, seek, place, selected, select, change }: {
  chart: Chart; peaks: Float32Array; timeMs: number; divisor: number; seek: (ms: number) => void;
  place: (ms: number, laneId: string) => void; selected: string[]; select: (ids: string[]) => void; change: (command: EditorCommand) => boolean;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), [span, setSpan] = useState(8000);
  const drag = useRef<Drag | null>(null), [ghost, setGhost] = useState<Drag | null>(null);
  const start = Math.floor(Math.min(timeMs, Math.max(0, chart.durationMs - .001)) / span) * span, end = Math.min(chart.durationMs, start + span);
  const labelWidth = 76, waveHeight = 72, rowHeight = 32;
  const visible = useMemo(() => {
    const rows = new Map(chart.lanes.map(lane => [lane.id, [] as ChartNote[]]));
    for (const note of chart.notes) {
      if (note.timeMs > end) break;
      if ((note.kind === "hold" ? note.endMs : note.timeMs) >= start) for (const id of note.laneIds) rows.get(id)?.push(note);
    }
    return rows;
  }, [chart, start, end]);
  useEffect(() => { drag.current = null; setGhost(null); }, [chart, start, span]);
  useEffect(() => {
    const node = canvas.current!, ctx = node.getContext("2d")!;
    const draw = () => {
      const width = node.clientWidth, height = waveHeight + chart.lanes.length * rowHeight, ratio = Math.min(devicePixelRatio || 1, 2);
      node.width = Math.round(width * ratio); node.height = height * ratio; ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      const x = (ms: number) => labelWidth + (ms - start) / span * (width - labelWidth);
      ctx.fillStyle = "#111a25"; ctx.fillRect(0, 0, width, height); ctx.font = "13px system-ui";
      ctx.fillStyle = "#487b8e";
      for (let pixel = labelWidth; pixel < width; pixel += 2) {
        const a = Math.floor((start + (pixel - labelWidth) / (width - labelWidth) * span) / chart.durationMs * peaks.length);
        const b = Math.min(peaks.length, Math.ceil((start + (pixel + 2 - labelWidth) / (width - labelWidth) * span) / chart.durationMs * peaks.length));
        let peak = 0; for (let i = a; i < b; i++) peak = Math.max(peak, peaks[i] ?? 0);
        ctx.fillRect(pixel, 40 - peak * 23, 1, Math.max(1, peak * 46));
      }
      chart.timing.forEach((point, i) => {
        const step = 60000 / point.bpm / divisor, stop = Math.min(end, chart.timing[i + 1]?.timeMs ?? end);
        let index = Math.max(0, Math.ceil((start - point.timeMs) / step));
        // Dense tuplets still snap precisely; omit their sub-grid when under four pixels.
        const stride = step / span * (width - labelWidth) < 4 ? divisor : 1;
        if (stride > 1) index = Math.ceil(index / divisor) * divisor;
        for (let n = 0; point.timeMs + index * step <= stop && n < 2000; index += stride, n++) {
          const at = point.timeMs + index * step, major = index % divisor === 0;
          ctx.strokeStyle = major ? "#455367" : "#263344"; ctx.beginPath(); ctx.moveTo(x(at), 66); ctx.lineTo(x(at), height); ctx.stroke();
          if (major && step * divisor / span * (width - labelWidth) > 40) { ctx.fillStyle = "#b1c0d0"; ctx.fillText((at / 1000).toFixed(2), x(at) + 3, 13); }
        }
      });
      const selectedIds = new Set(selected), ghostIds = new Set(ghost?.ids ?? []);
      chart.lanes.forEach((lane, i) => {
        const y = waveHeight + i * rowHeight;
        ctx.fillStyle = "#111a25"; ctx.fillRect(0, y, labelWidth, rowHeight);
        ctx.fillStyle = "#b8c4d5"; ctx.fillText(`Line ${i + 1}`, 10, y + 21);
        ctx.strokeStyle = "#293748"; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        const drawNote = (note: ChartNote, highlighted: boolean) => {
          ctx.fillStyle = note.kind === "hold" ? "#b9a1ff" : "#53d9ef";
          if (note.kind === "hold") ctx.fillRect(Math.max(labelWidth, x(note.timeMs)), y + 12, Math.min(width, x(note.endMs)) - Math.max(labelWidth, x(note.timeMs)), 8);
          if (note.timeMs >= start) { ctx.beginPath(); ctx.arc(x(note.timeMs), y + 16, 6, 0, Math.PI * 2); ctx.fill(); }
          if (note.kind === "hold" && note.endMs <= end) { ctx.strokeStyle = "#d5c7ff"; ctx.beginPath(); ctx.arc(x(note.endMs), y + 16, 5, 0, Math.PI * 2); ctx.stroke(); }
          if (highlighted) { ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.strokeRect(Math.max(labelWidth, x(note.timeMs) - 9), y + 6, Math.max(18, Math.min(width, x(note.kind === "hold" ? note.endMs : note.timeMs) + 9) - Math.max(labelWidth, x(note.timeMs) - 9)), 20); ctx.lineWidth = 1; }
        };
        ctx.save(); ctx.beginPath(); ctx.rect(labelWidth, y, width - labelWidth, rowHeight); ctx.clip();
        for (const note of visible.get(lane.id) ?? []) {
          const moving = ghost?.moved && ghostIds.has(note.id);
          ctx.globalAlpha = moving ? .25 : 1; drawNote(note, selectedIds.has(note.id));
          if (moving) { ctx.globalAlpha = 1; drawNote({ ...note, timeMs: note.timeMs + (ghost.tail ? 0 : ghost.delta), ...(note.kind === "hold" ? { endMs: note.endMs + ghost.delta } : {}) }, true); }
        }
        ctx.restore();
      });
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x(timeMs), 0); ctx.lineTo(x(timeMs), height); ctx.stroke();
    };
    const resize = new ResizeObserver(draw); resize.observe(node); draw(); return () => resize.disconnect();
  }, [chart, peaks, timeMs, divisor, start, end, span, visible, selected, ghost]);
  function position(event: React.MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { time: Math.min(chart.durationMs, snapTime(chart.timing, start + Math.max(0, event.clientX - rect.left - labelWidth) / (rect.width - labelWidth) * span, divisor)),
      lane: chart.lanes[Math.floor((event.clientY - rect.top - waveHeight) / rowHeight)] };
  }
  function hit(event: React.MouseEvent<HTMLCanvasElement>) {
    const { lane } = position(event), rect = event.currentTarget.getBoundingClientRect(), px = event.clientX - rect.left;
    if (!lane || px < labelWidth) return;
    const x = (ms: number) => labelWidth + (ms - start) / span * (rect.width - labelWidth);
    const candidates = (visible.get(lane.id) ?? []).flatMap(note => [
      { note, tail: false, distance: Math.abs(x(note.timeMs) - px) },
      ...(note.kind === "hold" ? [{ note, tail: true, distance: Math.abs(x(note.endMs) - px) }] : []),
    ]).filter(item => item.distance <= 9).sort((a, b) => a.distance - b.distance);
    return candidates[0];
  }
  function cancel() { drag.current = null; setGhost(null); }
  function down(event: React.PointerEvent<HTMLCanvasElement>) {
    if (event.button !== 0) return;
    event.currentTarget.focus(); const target = hit(event);
    if (!target) { if (!event.shiftKey) select([]); seek(position(event).time); return; }
    const { note, tail } = target;
    if (event.shiftKey) { select(selected.includes(note.id) ? selected.filter(id => id !== note.id) : [...selected, note.id]); return; }
    const ids = tail || !selected.includes(note.id) ? [note.id] : selected; select(ids);
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event.pointerId, x: event.clientX, anchor: tail && note.kind === "hold" ? note.endMs : note.timeMs, note, tail, ids, delta: 0, moved: false };
  }
  function move(event: React.PointerEvent<HTMLCanvasElement>) {
    const current = drag.current; if (!current || current.pointer !== event.pointerId) return;
    const dx = event.clientX - current.x;
    if (!current.moved && Math.abs(dx) < 4) return;
    const target = current.anchor + dx / (event.currentTarget.getBoundingClientRect().width - labelWidth) * span;
    current.delta = Math.round((snapTime(chart.timing, target, divisor) - current.anchor) * 1000) / 1000;
    current.moved = true; setGhost({ ...current });
  }
  function up(event: React.PointerEvent<HTMLCanvasElement>) {
    const current = drag.current; if (!current || current.pointer !== event.pointerId) return;
    cancel(); event.currentTarget.releasePointerCapture(event.pointerId);
    if (!current.moved || !current.delta) return;
    if (current.tail && current.note.kind === "hold") change({ type: "edit-note", id: current.note.id, timeMs: current.note.timeMs, endMs: current.note.endMs + current.delta, laneIds: current.note.laneIds });
    else change({ type: "move-notes", ids: current.ids, amount: current.delta, unit: "ms" });
  }
  return <section className="editor-timeline" aria-label="Song timeline">
    <div className="editor-timeline-heading"><h2>Timeline</h2><label>View <select value={span} onChange={event => setSpan(Number(event.target.value))}>
      {[4000, 8000, 16000, 32000].map(ms => <option key={ms} value={ms}>{ms / 1000} seconds</option>)}
    </select></label><span>{(start / 1000).toFixed(1)}–{(end / 1000).toFixed(1)} s</span></div>
    <div className="editor-timeline-scroll"><canvas ref={canvas} tabIndex={0} style={{ height: waveHeight + chart.lanes.length * rowHeight }} role="img"
      aria-label="Audio waveform, beat grid and circle tracks. Select and drag circle starts or hold ends. Selection controls below provide keyboard editing."
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onLostPointerCapture={cancel} onKeyDown={event => { if (event.key === "Escape") cancel(); }}
      onDoubleClick={event => { if (hit(event)) return; const { time, lane } = position(event); if (lane) place(time, lane.id); }} /></div>
    <label className="visually-hidden" htmlFor="editor-seek">Song position</label><input id="editor-seek" type="range" min={0} max={chart.durationMs} step={1} value={timeMs} onChange={event => seek(Number(event.target.value))} />
    <p className="editor-hint">Click empty space to seek; double-click to add a tap. Shift-click circles to select several. Drag their starts to move, or a hold end to resize. Escape cancels a drag.</p>
  </section>;
}
