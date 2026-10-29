import { memo, useId } from "react";

// Map packs have no cover images (v1 format), so each set gets deterministic
// artwork built from the game's own motif: angled lines, orbs and a target ring.
const PALETTES = [
  { from: 196, to: 254, orb: 186, accent: 322 },
  { from: 254, to: 322, orb: 254, accent: 186 },
  { from: 168, to: 214, orb: 160, accent: 254 },
  { from: 222, to: 286, orb: 200, accent: 40 },
  { from: 300, to: 236, orb: 322, accent: 186 },
] as const;

function random(seed: string) {
  let state = 2166136261;
  for (let i = 0; i < seed.length; i++) state = Math.imul(state ^ seed.charCodeAt(i), 16777619);
  return () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507);
    state = Math.imul(state ^ (state >>> 13), 3266489909);
    return ((state ^= state >>> 16) >>> 0) / 4294967296;
  };
}

export const CoverArt = memo(function CoverArt({ seed, className = "" }: { seed: string; className?: string }) {
  // Unique per instance: the same cover can appear twice on one screen.
  const id = `cover${useId().replace(/[^a-z0-9]/gi, "")}`;
  const next = random(seed);
  const palette = PALETTES[Math.floor(next() * PALETTES.length)];
  const angle = -35 + next() * 70;
  const lines = Array.from({ length: 3 + Math.floor(next() * 3) }, (_, i) => ({
    offset: -40 + i * (100 / 3) + next() * 18,
    tilt: angle + (next() - .5) * 26,
    orb: 15 + next() * 70,
    hue: i % 2 ? palette.accent : palette.orb,
  }));
  const ring = { x: 22 + next() * 56, y: 22 + next() * 56, r: 10 + next() * 9 };
  return <svg className={`cover-art ${className}`} viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-bg`} x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor={`hsl(${palette.from} 46% 22%)`} />
        <stop offset="1" stopColor={`hsl(${palette.to} 42% 12%)`} />
      </linearGradient>
      <radialGradient id={`${id}-glow`} cx={ring.x / 100} cy={ring.y / 100} r=".7">
        <stop offset="0" stopColor={`hsl(${palette.orb} 80% 70% / .45)`} />
        <stop offset="1" stopColor={`hsl(${palette.orb} 80% 70% / 0)`} />
      </radialGradient>
      <radialGradient id={`${id}-orb`} cx=".35" cy=".3" r=".8">
        <stop offset="0" stopColor="hsl(0 0% 100%)" />
        <stop offset=".35" stopColor={`hsl(${palette.orb} 78% 72%)`} />
        <stop offset="1" stopColor={`hsl(${palette.orb} 60% 34%)`} />
      </radialGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#${id}-bg)`} />
    <rect width="100" height="100" fill={`url(#${id}-glow)`} />
    {lines.map((line, i) => <g key={i} transform={`translate(50 ${50 + line.offset}) rotate(${line.tilt})`}>
      <line x1="-90" x2="90" y1="0" y2="0" stroke={`hsl(${line.hue} 70% 82% / .5)`} strokeWidth=".7" />
      <circle cx={line.orb - 50} cy="0" r="3.4" fill={line.hue === palette.orb ? `url(#${id}-orb)` : `hsl(${line.hue} 72% 74%)`} />
    </g>)}
    <circle cx={ring.x} cy={ring.y} r={ring.r} fill="none" stroke="hsl(0 0% 100% / .85)" strokeWidth="1.4" />
    <circle cx={ring.x} cy={ring.y} r={ring.r + 4} fill="none" stroke={`hsl(${palette.orb} 80% 80% / .25)`} strokeWidth=".6" />
  </svg>;
});
