import { afterEach, expect, it, vi } from "vitest";
import { loadSettings, saveSettings } from "./settings";
afterEach(() => vi.unstubAllGlobals());
const system = (raw: string | null, reduced = false) => {
  vi.stubGlobal("matchMedia", () => ({matches: reduced}));
  vi.stubGlobal("localStorage", {getItem:()=>raw,setItem:vi.fn()});
};
it("defaults to the system's reduced-motion preference", () => {
  system(null,true);
  expect(loadSettings()).toEqual({offsetMs:0,volume:.6,hitVolume:.15,skinId:"midnight",reducedMotion:true,freezeMotion:false});
});
it("clamps corrupt saved settings", () => {
  system('{"offsetMs":9000,"volume":-2,"reducedMotion":false}');
  expect(loadSettings()).toEqual({offsetMs:250,volume:0,hitVolume:.15,skinId:"midnight",reducedMotion:false,freezeMotion:false});
});
it("falls back on malformed JSON", () => {
  system('invalid');expect(loadSettings().offsetMs).toBe(0);
});
it("keeps gameplay available when storage is blocked", () => {
  vi.stubGlobal("matchMedia",()=>({matches:false}));
  vi.stubGlobal("localStorage",{getItem(){throw new Error("blocked");},setItem(){throw new Error("blocked");}});
  expect(loadSettings().volume).toBe(.6);
  expect(()=>saveSettings({...loadSettings(),volume:.5})).not.toThrow();
});
it("migrates old preferences without resetting their existing values", () => {
  system('{"offsetMs":35,"volume":0.25,"reducedMotion":true}');
  expect(loadSettings()).toEqual({offsetMs:35,volume:.25,reducedMotion:true,hitVolume:.15,skinId:"midnight",freezeMotion:false});
});
it("preserves mute and the selected skin through saving", () => {
  system('{"hitVolume":0,"skinId":"high-contrast"}');
  const settings = loadSettings(); saveSettings(settings);
  expect(settings).toMatchObject({hitVolume:0,skinId:"high-contrast"});
  expect(localStorage.setItem).toHaveBeenCalledWith("osu-base.rhythm.settings.v1", JSON.stringify(settings));
});
it("falls back for unknown skin IDs and clamps hit volume", () => {
  system('{"hitVolume":4,"skinId":"missing"}');
  expect(loadSettings()).toMatchObject({hitVolume:1,skinId:"midnight"});
  system('{"hitVolume":"bad","skinId":{}}');
  expect(loadSettings()).toMatchObject({hitVolume:.15,skinId:"midnight"});
});
it("keeps frozen-line assistance distinct from reduced effects and requires a boolean", () => {
  system('{"reducedMotion":true,"freezeMotion":"yes"}');
  expect(loadSettings()).toMatchObject({ reducedMotion: true, freezeMotion: false });
  system('{"reducedMotion":false,"freezeMotion":true}');
  expect(loadSettings()).toMatchObject({ reducedMotion: false, freezeMotion: true });
});
it("retains a custom pack identity before asynchronous storage is initialized", () => {
  const skinId = "skin:" + "d".repeat(64); system(JSON.stringify({ skinId }));
  expect(loadSettings().skinId).toBe(skinId);
});
