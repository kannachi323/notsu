import type { HitEffect } from "./feedback";
import { noteRadius } from "./skins";
import type { Skin } from "./skins";

export function ring(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string, width: number) {
  ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
}

export function orb(ctx: CanvasRenderingContext2D, x: number, color: string, skin: Skin, hollow = false) {
  const radius = noteRadius(skin);
  if (!hollow) {
    const shade = ctx.createRadialGradient(x - radius * .35, -radius * .4, 0, x, 0, radius * 1.15);
    shade.addColorStop(0, skin.note.highlight); shade.addColorStop(.32, color); shade.addColorStop(1, skin.note.shade);
    ctx.fillStyle = shade;
    ctx.beginPath(); ctx.arc(x, 0, radius, 0, Math.PI * 2); ctx.fill();
  } else {
    // Opaque interior keeps the ribbon/lane from confusing the release silhouette.
    ctx.fillStyle = skin.ui.background;
    ctx.beginPath(); ctx.arc(x, 0, radius, 0, Math.PI * 2); ctx.fill();
  }
  ring(ctx, x, 0, radius, color, skin.note.rim);
  if (!hollow) {
    ctx.fillStyle = skin.note.highlight;
    ctx.beginPath(); ctx.ellipse(x - radius * .3, -radius * .35, radius * .22, radius * .13, -.6, 0, Math.PI * 2); ctx.fill();
  }
}

export function ribbon(ctx: CanvasRenderingContext2D, head: number, tail: number, skin: Skin) {
  ctx.save(); ctx.globalAlpha *= skin.lane.ribbonOpacity;
  ctx.strokeStyle = skin.note.hold; ctx.lineWidth = skin.lane.ribbonWidth; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(head, 0); ctx.lineTo(tail, 0); ctx.stroke(); ctx.restore();
}

export function paintEffect(ctx: CanvasRenderingContext2D, effect: HitEffect, time: number, skin: Skin) {
  const progress = Math.max(0, (time - effect.event.atMs) / effect.durationMs);
  if (progress >= 1) return;
  const { event, anchor } = effect;
  ctx.save(); ctx.translate(anchor.x, anchor.y);
  ctx.globalAlpha = 1 - progress;
  if (effect.failed) {
    ctx.rotate(anchor.radians); ctx.globalAlpha *= .45;
    const { head, tail } = effect.failed;
    if (tail !== undefined) {
      ribbon(ctx, head, tail, skin); orb(ctx, tail, skin.note.hold, skin, true);
    }
    orb(ctx, head, tail === undefined ? skin.note.tap : skin.note.hold, skin);
  } else if (event.grade === "Extra") {
    ring(ctx, 0, 0, skin.target.radius + 4, skin.effects.warning, 2);
    ctx.fillStyle = skin.effects.warning; ctx.font = "bold 16px system-ui";
    ctx.textAlign = "center"; ctx.fillText("!", 0, -skin.target.radius - 9);
  } else if (event.grade !== "Miss") {
    const color = event.action === "tap" ? skin.note.tap : skin.note.hold;
    const release = event.action === "release";
    const press = event.action === "press";
    const growth = effect.reducedMotion ? 0 : progress * skin.effects.expansion * (release ? 1.2 : press ? .35 : 1);
    ring(ctx, 0, 0, skin.target.radius + growth, color, release ? 3 : 2);
    if (!effect.reducedMotion && !press) {
      const count = Math.max(0, Math.min(4, skin.effects.sparks));
      for (let i = 0; i < count; i++) {
        const angle = (i + .5) * Math.PI * 2 / count;
        const distance = skin.target.radius + progress * skin.effects.sparkTravel * (release ? 1.2 : 1);
        ctx.fillStyle = color; ctx.beginPath();
        ctx.arc(Math.cos(angle) * distance, Math.sin(angle) * distance, release ? 2 : 1.5, 0, Math.PI * 2); ctx.fill();
      }
    }
  }
  ctx.restore();
}
