import type { Settings } from "../data/settings";
import { SkinManager } from "../../skins/components/SkinManager";
import { Checkbox, Panel, Slider } from "../../../shared/components";
import { Calibration } from "./Calibration";

export function SettingsPanel({ settings, updateSettings }: { settings: Settings; updateSettings: (settings: Settings) => void }) {
  return <div className="settings-grid">
    <Panel className="settings-appearance" title="Skin" description="Artwork, sounds and colours. Timing never changes.">
      <SkinManager skinId={settings.skinId} volume={settings.hitVolume} select={skinId => updateSettings({ ...settings, skinId })} />
    </Panel>
    <div className="ui-stack ui-stack--lg">
      <Panel title="Audio">
        <Slider id="volume" label="Music" valueText={`${Math.round(settings.volume * 100)}%`} min="0" max="1" step=".05" value={settings.volume}
          onChange={event => updateSettings({ ...settings, volume: Number(event.target.value) })} />
        <Slider id="hit-volume" label="Hit sounds" valueText={`${Math.round(settings.hitVolume * 100)}%`} min="0" max="1" step=".05" value={settings.hitVolume}
          onChange={event => updateSettings({ ...settings, hitVolume: Number(event.target.value) })} />
      </Panel>
      <Panel title="Timing">
        <Calibration volume={Math.max(.3, settings.volume)} offsetMs={settings.offsetMs} apply={offsetMs => updateSettings({ ...settings, offsetMs })} />
        <Slider id="offset" label="Offset" valueText={`${settings.offsetMs > 0 ? "+" : ""}${settings.offsetMs} ms`} min="-250" max="250" step="5" value={settings.offsetMs}
          onChange={event => updateSettings({ ...settings, offsetMs: Number(event.target.value) })}
          description="Raise it if your hits land late." />
      </Panel>
      <Panel title="Gameplay">
        <Checkbox toggle label="Reduced motion" checked={settings.reducedMotion} onChange={event => updateSettings({ ...settings, reducedMotion: event.target.checked })}
          description="Static hit effects, no movement hints. Lines still move." />
        <Checkbox toggle label="Freeze line movement" checked={settings.freezeMotion} onChange={event => updateSettings({ ...settings, freezeMotion: event.target.checked })}
          description="Practice assist. Unranked." />
      </Panel>
    </div>
  </div>;
}
