import { getSkin } from "../components/skins";

export type Settings = { offsetMs: number; volume: number; hitVolume: number; skinId: string; reducedMotion: boolean };
const key = "osu-base.rhythm.settings.v1";

export function loadSettings(): Settings {
  const defaults: Settings = { offsetMs: 0, volume: .6, hitVolume: .15, skinId: "midnight", reducedMotion: matchMedia("(prefers-reduced-motion: reduce)").matches };
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "null");
    return {
      offsetMs: typeof raw?.offsetMs === "number" && Number.isFinite(raw.offsetMs) ? Math.max(-250, Math.min(250, raw.offsetMs)) : 0,
      volume: typeof raw?.volume === "number" && Number.isFinite(raw.volume) ? Math.max(0, Math.min(1, raw.volume)) : .6,
      reducedMotion: typeof raw?.reducedMotion === "boolean" ? raw.reducedMotion : defaults.reducedMotion,
      hitVolume: typeof raw?.hitVolume === "number" && Number.isFinite(raw.hitVolume) ? Math.max(0, Math.min(1, raw.hitVolume)) : .15,
      skinId: getSkin(raw?.skinId).id,
    };
  } catch { return defaults; }
}

export function saveSettings(settings: Settings): void {
  try { localStorage.setItem(key, JSON.stringify(settings)); } catch { /* Storage can be disabled. Gameplay remains available. */ }
}
