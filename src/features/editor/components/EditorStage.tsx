import { useEffect, useRef } from "react";
import type { Chart } from "../../rhythm/domain/chart";
import type { Settings } from "../../rhythm/data/settings";
import { APPROACH_MS } from "../../rhythm/domain/rules";
import type { NoteState } from "../../rhythm/domain/session";
import { HitFeedback } from "../../rhythm/components/feedback";
import { paintPlayfield } from "../../rhythm/components/paintPlayfield";

export function EditorStage({ chart, timeMs, settings }: { chart: Chart; timeMs: number; settings: Settings }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current!, context = node.getContext("2d")!;
    const draw = () => {
      const { width, height } = node.getBoundingClientRect(), ratio = Math.min(devicePixelRatio || 1, 2);
      node.width = Math.round(width * ratio); node.height = Math.round(height * ratio); context.setTransform(ratio, 0, 0, ratio, 0, 0);
      paintPlayfield(context, width, height, { phase: "playing", timeMs, settings, feedback: new HitFeedback(), session: {
        chart, assists: { freezeMotion: false, resumed: false },
        visibleStates: () => chart.notes.filter(note => note.timeMs <= timeMs + APPROACH_MS && (note.kind === "hold" ? note.endMs : note.timeMs) >= timeMs)
          .map((note): NoteState => ({ note, ...(note.kind === "hold" && note.timeMs < timeMs ? { head: "Perfect" } : {}) })),
      } });
    };
    const observer = new ResizeObserver(draw); observer.observe(node); draw(); return () => observer.disconnect();
  }, [chart, timeMs, settings]);
  return <canvas ref={canvas} className="editor-stage" role="img" aria-label="Map arrangement at the playhead. The playtest uses these same lines, notes, and movement rules." />;
}
