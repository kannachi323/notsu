import type { Settings } from "../data/settings";
import { skins } from "./skins";

export function SettingsPanel({ settings, updateSettings }: { settings: Settings; updateSettings: (settings: Settings) => void }) {
  return <div className="settings-panel">
    <section className="settings-section" aria-labelledby="appearance-title">
      <h2 id="appearance-title">Appearance</h2>
      <label htmlFor="skin">Skin</label>
      <select id="skin" value={settings.skinId} onChange={event => updateSettings({ ...settings, skinId: event.target.value })}>
        {skins.map(skin => <option key={skin.id} value={skin.id}>{skin.name}</option>)}
      </select>
      <label className="motion-choice"><input type="checkbox" checked={settings.reducedMotion} aria-describedby="motion-help"
        onChange={event => updateSettings({ ...settings, reducedMotion: event.target.checked })} /><span>Reduced motion</span></label>
      <p id="motion-help">Use static hit effects and hide movement hints. The authored line movement stays part of gameplay.</p>
    </section>
    <section className="settings-section" aria-labelledby="audio-title">
      <h2 id="audio-title">Audio and timing</h2>
      <label className="range-label" htmlFor="volume">Music volume <output htmlFor="volume">{Math.round(settings.volume * 100)}%</output></label>
      <input id="volume" type="range" min="0" max="1" step=".05" value={settings.volume}
        onChange={event => updateSettings({ ...settings, volume: Number(event.target.value) })} />
      <label className="range-label" htmlFor="hit-volume">Hit sound volume <output htmlFor="hit-volume">{Math.round(settings.hitVolume * 100)}%</output></label>
      <input id="hit-volume" type="range" min="0" max="1" step=".05" value={settings.hitVolume}
        onChange={event => updateSettings({ ...settings, hitVolume: Number(event.target.value) })} />
      <label className="range-label" htmlFor="offset">Timing offset <output htmlFor="offset">{settings.offsetMs > 0 ? "+" : ""}{settings.offsetMs} ms</output></label>
      <input id="offset" type="range" min="-250" max="250" step="5" value={settings.offsetMs} aria-describedby="offset-help"
        onChange={event => updateSettings({ ...settings, offsetMs: Number(event.target.value) })} />
      <p id="offset-help">Increase this if your hits consistently register late. Positive values move note timing later relative to the music.</p>
    </section>
  </div>;
}
