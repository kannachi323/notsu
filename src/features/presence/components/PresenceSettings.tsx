import { useAccountStore } from "../../accounts/accountStore";
import { usePresenceStore } from "../presenceStore";
import { saveVisibility } from "../data/settings";
import { Button, Notice, Panel, Tabs } from "../../../shared/components";
import "../presence.css";

const choices = [{ value: "hidden", label: "Hidden" }, { value: "friends", label: "Friends only" }] as const;

export function PresenceSettings() {
  const id = useAccountStore(state => state.identity?.id), presence = usePresenceStore();
  if (!id || id !== presence.userId) return null;
  return <Panel title="Online visibility" description="Let accepted friends see when you’re online. Your last-seen time and game activity stay private. Hiding your status does not stop messages.">
    <Tabs variant="segmented" label="Who can see my online status" items={choices} value={presence.visibility} disabled={presence.saving || presence.visibility === null}
      onChange={value => void saveVisibility(value)} />
    <p role="status" className="ui-text-muted ui-text-small">{presence.saving ? "Saving visibility…" : presence.visibility === null ? "Checking your visibility…" : presence.visibility === "hidden" ? "You appear offline to other players." : presence.connected ? "Your visible app window is sharing online status with friends." : "Friends can see your status when this app connects."}</p>
    {presence.error && <Notice tone="danger" role="alert" actions={<Button size="sm" onClick={() => usePresenceStore.setState(state => ({ refresh: state.refresh + 1 }))}>Retry status</Button>}>{presence.error}</Notice>}
  </Panel>;
}
