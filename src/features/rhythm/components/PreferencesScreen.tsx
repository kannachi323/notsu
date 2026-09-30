import { useEffect, useLayoutEffect, useState } from "react";
import { Link } from "react-router";
import { HomeHeader } from "../../home/components/HomeHeader";
import { loadSettings, saveSettings } from "../data/settings";
import { SettingsPanel } from "./SettingsPanel";
import { HowToPlay } from "./HowToPlay";
import { initializeSkins, useSkinCatalog } from "../../skins/useSkinCatalog";
import { getSkin, skinVariables } from "./skins";

export function PreferencesScreen({ help = false }: { help?: boolean }) {
  const [settings, setSettings] = useState(loadSettings);
  const skinRevision = useSkinCatalog(state => state.revision);
  useEffect(() => { void initializeSkins(); }, []);
  useLayoutEffect(() => {
    for (const [name, value] of Object.entries(skinVariables(getSkin(settings.skinId)))) {
      document.documentElement.style.setProperty(name, value);
    }
  }, [settings.skinId, skinRevision]);
  return <div className="notsu-home preferences-screen"><HomeHeader /><main className="preferences-main"><Link to="/rhythm">← Song selection</Link>
    <h1>{help ? "How to play" : "Settings"}</h1>
    {help ? <><HowToPlay /><Link className="menu-action-link" to="/rhythm">Choose your first map →</Link></> : <SettingsPanel settings={settings} updateSettings={next => { setSettings(next); saveSettings(next); }} />}
  </main></div>;
}
