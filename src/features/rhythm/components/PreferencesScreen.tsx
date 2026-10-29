import { useEffect, useLayoutEffect, useState } from "react";
import { AppScreen } from "../../home/components/AppScreen";
import { ButtonLink, Page, PageHeader, Panel } from "../../../shared/components";
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
  return <AppScreen><Page width="narrow">
    <PageHeader back={{ to: "/rhythm", label: "Song selection" }} icon={help ? "info" : "settings"} title={help ? "How to play" : "Settings"}
      description={help ? "Circles ride moving lines. Press any key as they reach the target." : "Saved on this device and applied the next time you play."} />
    {help ? <>
      <Panel aria-label="How to play"><HowToPlay /></Panel>
      <div><ButtonLink variant="primary" size="lg" to="/rhythm">Choose your first map</ButtonLink></div>
    </> : <SettingsPanel settings={settings} updateSettings={next => { setSettings(next); saveSettings(next); }} />}
  </Page></AppScreen>;
}
