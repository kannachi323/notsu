import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { MenuHome } from "./MenuHome";
import { ChartSelect } from "./ChartSelect";
import { SettingsPanel } from "./SettingsPanel";
import { Setup } from "./Setup";

const settings = { skinId: "midnight", offsetMs: 0, volume: .6, hitVolume: .15, reducedMotion: false };
const actions = { fileName: "", loading: false, error: "", chooseFile: vi.fn(), start: vi.fn() };

it("keeps the home screen to three real navigation choices without setup clutter", () => {
  const html = renderToStaticMarkup(<MenuHome navigate={vi.fn()} />);
  expect(html.match(/<button/g)).toHaveLength(3);
  for (const title of ["Play", "Settings", "How to play"]) expect(html).toContain(title);
  expect(html).not.toContain("<input");
  expect(html).not.toContain("BPM");
  expect(html).not.toContain("prototype");
  expect(html).toContain('aria-label="Main menu"');
});
it("opens the menu at home, with audio loading only inside chart selection", () => {
  const html = renderToStaticMarkup(<Setup {...actions} settings={settings} updateSettings={vi.fn()} />);
  expect(html).toContain('id="home-title"');
  expect(html).not.toContain('type="file"');
});
it("defaults to playable practice when no file is loaded", () => {
  const html = renderToStaticMarkup(<ChartSelect {...actions} />);
  const radios = html.match(/<input[^>]+>/g)!;
  expect(radios).toHaveLength(3);
  expect(radios.find(input => input.includes('value="basic"'))).toContain('checked=""');
  expect(html).not.toContain('disabled=""');
  expect(html).not.toContain('type="file"');
});
it("selects the song when audio is already loaded and disables play during loading", () => {
  const html = renderToStaticMarkup(<ChartSelect {...actions} fileName="audio.mp3" loading />);
  expect(html.match(/<input[^>]+>/g)?.find(input => input.includes('value="song"'))).toContain('checked=""');
  expect(html).toContain('type="file"');
  expect(html).toContain('disabled=""');
  expect(html).toContain('role="status"');
});
it("makes failed startup errors visible rather than hiding them behind the home screen", () => {
  const html = renderToStaticMarkup(<Setup {...actions} error="Audio could not start." settings={settings} updateSettings={vi.fn()} />);
  expect(html).toContain('id="menu-title"');
  expect(html).toContain('role="alert"');
  expect(html).toContain("Audio could not start.");
});
it("retains labelled skin, volume, timing and reduced-motion controls", () => {
  const html = renderToStaticMarkup(<SettingsPanel settings={settings} updateSettings={vi.fn()} />);
  for (const id of ["skin", "volume", "hit-volume", "offset"]) {
    expect(html).toContain(`id="${id}"`); expect(html).toContain(`for="${id}"`);
  }
  expect(html).toContain("High Contrast"); expect(html).toContain("Reduced motion");
});
it("keeps explicit interface text at least 16px and does not force uppercase", () => {
  for (const path of ["../../../app/styles.css", "../menu.css", "../rhythm.css"]) {
    const css = readFileSync(new URL(path, import.meta.url), "utf8");
    for (const match of css.matchAll(/font-size:\s*(\d+)px/g)) expect(Number(match[1])).toBeGreaterThanOrEqual(16);
    expect(css).not.toMatch(/text-transform:\s*uppercase/);
  }
});
