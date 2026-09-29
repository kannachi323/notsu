import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import type { Runtime } from "../useRhythmGame";
import { paintPlayfield } from "./paintPlayfield";

export function Playfield({ runtime }: { runtime: RefObject<Runtime> }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const node = canvas.current!;
    const context = node.getContext("2d")!;
    let width = 0, height = 0, frame = 0;
    const resize = () => {
      const rect = node.getBoundingClientRect();
      width = rect.width; height = rect.height;
      const ratio = Math.min(devicePixelRatio || 1, 2);
      node.width = Math.round(width * ratio); node.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(node); resize();
    const draw = () => { paintPlayfield(context, width, height, runtime.current); frame = requestAnimationFrame(draw); };
    draw();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [runtime]);
  return <canvas ref={canvas} className="playfield" role="img" aria-label="Moving rhythm lane. Tap when orb centres cross the target ring; hold solid heads and release at hollow endpoints." />;
}
