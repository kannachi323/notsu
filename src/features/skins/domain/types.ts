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
export interface Tone { frequency: number; endFrequency: number; duration: number; gain: number; wave: "sine" | "triangle" | "square" | "sawtooth" }

