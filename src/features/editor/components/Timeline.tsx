import { useEffect, useRef, useState } from "react";
import type { Chart } from "../../rhythm/domain/chart";
import { snapTime } from "../../rhythm/domain/timing";

export function Timeline({ chart, peaks, timeMs, divisor, seek, place }: {
  chart: Chart; peaks: Float32Array; timeMs: number; divisor: number; seek: (ms: number) => void;
  place: (ms: number, laneId: string) => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null), [span, setSpan] = useState(8000);
  const start = Math.floor(timeMs / span) * span, end = Math.min(chart.durationMs, start + span);
  const labelWidth = 76, waveHeight = 72, rowHeight = 32;
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
      chart.lanes.forEach((lane, i) => {
        const y = waveHeight + i * rowHeight;
        ctx.fillStyle = "#111a25"; ctx.fillRect(0, y, labelWidth, rowHeight);
        ctx.fillStyle = "#b8c4d5"; ctx.fillText(`Line ${i + 1}`, 10, y + 21);
        ctx.strokeStyle = "#293748"; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(width, y); ctx.stroke();
        for (const note of chart.notes) {
          if (!note.laneIds.includes(lane.id) || note.timeMs > end || (note.kind === "hold" ? note.endMs : note.timeMs) < start) continue;
          ctx.fillStyle = note.kind === "hold" ? "#b9a1ff" : "#53d9ef";
          if (note.kind === "hold") ctx.fillRect(Math.max(labelWidth, x(note.timeMs)), y + 12, Math.min(width, x(note.endMs)) - Math.max(labelWidth, x(note.timeMs)), 8);
          if (note.timeMs >= start) { ctx.beginPath(); ctx.arc(x(note.timeMs), y + 16, 6, 0, Math.PI * 2); ctx.fill(); }
          if (note.kind === "hold" && note.endMs <= end) { ctx.strokeStyle = "#d5c7ff"; ctx.beginPath(); ctx.arc(x(note.endMs), y + 16, 5, 0, Math.PI * 2); ctx.stroke(); }
        }
      });
      ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x(timeMs), 0); ctx.lineTo(x(timeMs), height); ctx.stroke();
    };
    const resize = new ResizeObserver(draw); resize.observe(node); draw(); return () => resize.disconnect();
  }, [chart, peaks, timeMs, divisor, start, end, span]);
  function position(event: React.MouseEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return { time: Math.min(chart.durationMs, snapTime(chart.timing, start + Math.max(0, event.clientX - rect.left - labelWidth) / (rect.width - labelWidth) * span, divisor)),
      lane: chart.lanes[Math.floor((event.clientY - rect.top - waveHeight) / rowHeight)] };
  }
  return <section className="editor-timeline" aria-label="Song timeline">
    <div className="editor-timeline-heading"><h2>Timeline</h2><label>View <select value={span} onChange={event => setSpan(Number(event.target.value))}>
      {[4000, 8000, 16000, 32000].map(ms => <option key={ms} value={ms}>{ms / 1000} seconds</option>)}
    </select></label><span>{(start / 1000).toFixed(1)}–{(end / 1000).toFixed(1)} s</span></div>
    <div className="editor-timeline-scroll"><canvas ref={canvas} style={{ height: waveHeight + chart.lanes.length * rowHeight }} role="img"
      aria-label="Audio waveform, beat grid and circle tracks. Click to seek; double-click a line track to place a tap. The controls above provide keyboard editing."
      onClick={event => seek(position(event).time)} onDoubleClick={event => { const { time, lane } = position(event); if (lane) place(time, lane.id); }} /></div>
    <label className="visually-hidden" htmlFor="editor-seek">Song position</label><input id="editor-seek" type="range" min={0} max={chart.durationMs} step={1} value={timeMs} onChange={event => seek(Number(event.target.value))} />
    <p className="editor-hint">Click to seek. Double-click a line track to add a tap. Use the position and note controls for precise keyboard editing.</p>
  </section>;
}
