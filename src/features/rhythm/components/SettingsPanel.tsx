import type { Settings } from "../data/settings";
import { SkinManager } from "../../skins/components/SkinManager";
import { Checkbox, Panel, Slider } from "../../../shared/components";

export function SettingsPanel({ settings, updateSettings }: { settings: Settings; updateSettings: (settings: Settings) => void }) {
  return <div className="ui-stack ui-stack--lg">
    <Panel title="Appearance" description="Skins change artwork, sounds and colours. Hit timing always stays the same.">
      <SkinManager skinId={settings.skinId} volume={settings.hitVolume} select={skinId => updateSettings({ ...settings, skinId })} />
      <hr className="ui-divider" />
      <Checkbox toggle label="Reduced motion" checked={settings.reducedMotion} onChange={event => updateSettings({ ...settings, reducedMotion: event.target.checked })}
        description="Use static hit effects and hide movement hints. The authored line movement stays part of gameplay." />
      <Checkbox toggle label="Freeze line movement" checked={settings.freezeMotion} onChange={event => updateSettings({ ...settings, freezeMotion: event.target.checked })}
        description="Keep each line in its opening position. This practice assist does not qualify for rankings." />
    </Panel>
    <Panel title="Audio and timing">
      <Slider id="volume" label="Music volume" valueText={`${Math.round(settings.volume * 100)}%`} min="0" max="1" step=".05" value={settings.volume}
        onChange={event => updateSettings({ ...settings, volume: Number(event.target.value) })} />
      <Slider id="hit-volume" label="Hit sound volume" valueText={`${Math.round(settings.hitVolume * 100)}%`} min="0" max="1" step=".05" value={settings.hitVolume}
        onChange={event => updateSettings({ ...settings, hitVolume: Number(event.target.value) })} />
      <Slider id="offset" label="Timing offset" valueText={`${settings.offsetMs > 0 ? "+" : ""}${settings.offsetMs} ms`} min="-250" max="250" step="5" value={settings.offsetMs}
        onChange={event => updateSettings({ ...settings, offsetMs: Number(event.target.value) })}
        description="Increase this if your hits consistently register late. Positive values move note timing later relative to the music." />
    </Panel>
  </div>;
}
