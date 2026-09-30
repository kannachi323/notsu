export const RULES_VERSION = "notsu-1";
export const APPROACH_MS = 1500;
export const HIT_WINDOW_MS = 140;
export type Grade = "Perfect" | "Good" | "Okay" | "Miss";
export type Mods = { noFail: boolean; autoplay: boolean };
export type Assists = { freezeMotion: boolean; resumed: boolean };
export const DEFAULT_MODS: Readonly<Mods> = Object.freeze({ noFail: false, autoplay: false });
export const ACCURACY_WEIGHTS: Readonly<Record<Grade, number>> = { Perfect: 1, Good: .7, Okay: .3, Miss: 0 };
// Integer health units avoid a floating-point residue surviving an exact zero.
export const HEALTH_CHANGE: Readonly<Record<Grade | "Extra", number>> = { Perfect: 2, Good: 1, Okay: 0, Miss: -12, Extra: -4 };

export function gradeFor(errorMs: number): Grade {
  const distance = Math.abs(errorMs);
  if (distance <= 45) return "Perfect";
  if (distance <= 90) return "Good";
  if (distance <= HIT_WINDOW_MS) return "Okay";
  return "Miss";
}

export function maximumComboCredit(count: number): number {
  let total = 0;
  for (let i = 1; i <= count; i++) total += Math.sqrt(i);
  return total;
}
