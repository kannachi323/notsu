import { useEffect, useRef } from "react";
import { getSkin } from "../data/registry";
import { barSprite } from "../../rhythm/components/sprites";
import { orb, ribbon, target } from "../../rhythm/components/orbs";

export function SkinPreview({ id, revision }: { id: string; revision: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const element = canvas.current, skin = getSkin(id); if (!element) return;
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    element.width = 420 * ratio; element.height = 110 * ratio;
    const ctx = element.getContext("2d"); if (!ctx) return;
    ctx.scale(ratio, ratio); ctx.fillStyle = skin.ui.background; ctx.fillRect(0, 0, 420, 110);
    ctx.translate(35, 55);
    if (!barSprite(ctx, skin, "lane", 0, 350, skin.lane.width)) {
      ctx.strokeStyle = skin.lane.color; ctx.lineWidth = skin.lane.width;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(350, 0); ctx.stroke();
    }
    target(ctx, skin, false); orb(ctx, 95, skin.note.tap, skin);
    ribbon(ctx, 210, 320, skin); orb(ctx, 210, skin.note.hold, skin); orb(ctx, 320, skin.note.hold, skin, true);
  }, [id, revision]);
  return <figure className="skin-preview"><canvas ref={canvas} role="img" aria-label="Selected skin preview: target, tap, and hold with release ring" />
    <figcaption>Target · tap · hold and release</figcaption></figure>;
}
