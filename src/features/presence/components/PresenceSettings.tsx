import { useAccountStore } from "../../accounts/accountStore";
import { usePresenceStore } from "../presenceStore";
import { saveVisibility } from "../data/settings";
import "../presence.css";

export function PresenceSettings() {
  const id = useAccountStore(state => state.identity?.id), presence = usePresenceStore();
  if (!id || id !== presence.userId) return null;
  return <section className="account-panel presence-settings" aria-label="Online visibility">
    <h2>Online visibility</h2><p className="account-muted">Let accepted friends see when you’re online. Your last-seen time and game activity stay private. Hiding your status does not stop messages.</p>
    <div className="presence-choices" role="group" aria-label="Who can see my online status">
      <button aria-pressed={presence.visibility === "hidden"} disabled={presence.saving} onClick={() => void saveVisibility("hidden")}>Hidden</button>
      <button aria-pressed={presence.visibility === "friends"} disabled={presence.saving} onClick={() => void saveVisibility("friends")}>Friends only</button>
    </div>
    <p role="status" className="account-muted">{presence.saving ? "Saving visibility…" : presence.visibility === null ? "Checking your visibility…" : presence.visibility === "hidden" ? "You appear offline to other players." : presence.connected ? "Your visible app window is sharing online status with friends." : "Friends can see your status when this app connects."}</p>
    {presence.error && <p className="account-error" role="alert">{presence.error} <button onClick={() => usePresenceStore.setState(state => ({ refresh: state.refresh + 1 }))}>Retry status</button></p>}
  </section>;
}
