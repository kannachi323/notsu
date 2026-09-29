/** Appearance only. Timing, coordinates, input and scoring are deliberately absent. */
export interface Skin {
  id: string;
  name: string;
  atlas?: "gloss-v1";
  ui: Record<"background" | "surface" | "text" | "muted" | "border" | "accent" | "hold" | "focus" | "on-accent" | "warning" | "error-surface" | "overlay", string>;
  note: { radius: number; rim: number; tap: string; hold: string; highlight: string; shade: string };
  lane: { color: string; width: number; ribbonWidth: number; ribbonOpacity: number; hint: string };
  target: { radius: number; width: number; color: string };
  effects: { durationMs: number; expansion: number; sparks: number; sparkTravel: number; warning: string };
  sounds: { tap: Tone; release: Tone };
}
export interface Tone { frequency: number; endFrequency: number; duration: number; gain: number; wave: OscillatorType }

const midnight: Skin = {
  id: "midnight", name: "Midnight", atlas: "gloss-v1",
  ui: { background: "#10141e", surface: "#171e2b", text: "#eef3fb", muted: "#a1aec3", border: "#303b4e", accent: "#86dcf4", hold: "#bdabff", focus: "#86dcf4", "on-accent": "#12202b", warning: "#ffc0b8", "error-surface": "#332027", overlay: "#10141ef2" },
  note: { radius: 9, rim: 1.5, tap: "#86dcf4", hold: "#bdabff", highlight: "#ffffff", shade: "#26344f" },
  lane: { color: "#566176", width: 2, ribbonWidth: 7, ribbonOpacity: .5, hint: "#8793a9" },
  target: { radius: 15, width: 2, color: "#eef3fb" },
  effects: { durationMs: 200, expansion: 14, sparks: 4, sparkTravel: 18, warning: "#ed9b9b" },
  sounds: { tap: { frequency: 1000, endFrequency: 650, duration: .045, gain: .22, wave: "sine" }, release: { frequency: 1250, endFrequency: 850, duration: .065, gain: .26, wave: "sine" } },
};
const highContrast: Skin = {
  ...midnight, id: "high-contrast", name: "High Contrast", atlas: undefined,
  ui: { background: "#080b12", surface: "#161e2c", text: "#ffffff", muted: "#c5cfdf", border: "#8593ab", accent: "#8cecff", hold: "#d3baff", focus: "#ffe696", "on-accent": "#080b12", warning: "#ffb7ab", "error-surface": "#382026", overlay: "#080b12f5" },
  note: { radius: 10, rim: 2, tap: "#8cecff", hold: "#d3baff", highlight: "#ffffff", shade: "#344765" },
  lane: { color: "#8d9bb3", width: 2.5, ribbonWidth: 8, ribbonOpacity: .65, hint: "#c5cfdf" },
  target: { radius: 16, width: 3, color: "#ffffff" },
  effects: { ...midnight.effects, warning: "#ffb7ab" },
};
export const skins: readonly Skin[] = [midnight, highContrast];
export const getSkin = (id: unknown): Skin => skins.find(skin => skin.id === id) ?? midnight;
// Fixed readability bounds, even when more built-in definitions are added later.
export const noteRadius = (skin: Skin) => Math.max(8, Math.min(10, skin.note.radius));
export const skinVariables = (skin: Skin) => Object.fromEntries(Object.entries(skin.ui).map(([name, value]) => [`--${name}`, value]));
