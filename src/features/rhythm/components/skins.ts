import type { Skin } from "../../skins/domain/types";
export type { Skin, Tone } from "../../skins/domain/types";
export { builtinSkins as skins } from "../../skins/domain/builtins";
export { getSkin } from "../../skins/data/registry";
// Fixed readability bounds, even when more built-in definitions are added later.
export const noteRadius = (skin: Skin) => Math.max(8, Math.min(10, skin.note.radius));
export const skinVariables = (skin: Skin) => Object.fromEntries(Object.entries(skin.ui).map(([name, value]) => [`--${name}`, value]));
