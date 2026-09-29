import { useAccountStore } from "../../accounts/accountStore";
import { usePresenceStore } from "../presenceStore";
import { renewPresence } from "./presence";

/** One app instance owns one client ID; sequence ordering makes late renewals harmless. */
export function startPresenceHeartbeat(userId: string, isVisible: () => boolean) {
  const clientId = crypto.randomUUID();
  let sequence = 0, stopped = false, inFlight = 0, lastVisible: boolean | null = null;
  async function update(visible: boolean, keepalive = false, force = false) {
    if (useAccountStore.getState().identity?.id !== userId) return;
    if (!keepalive && !force && inFlight && visible === lastVisible) return;
    lastVisible = visible;
    const requestSequence = ++sequence, generation = usePresenceStore.getState().generation;
    inFlight++;
    try {
      const result = await renewPresence(userId, { clientId, sequence: requestSequence, visible }, keepalive);
      const current = usePresenceStore.getState();
      if (!stopped && sequence === requestSequence && current.userId === userId && !current.saving && current.generation === generation) {
        usePresenceStore.setState({ visibility: result.visibility, connected: result.validForMs > 0, error: "" });
      }
    } catch (cause) {
      const current = usePresenceStore.getState();
      if (!stopped && sequence === requestSequence && current.userId === userId && !current.saving && current.generation === generation) {
        usePresenceStore.setState({ connected: false, error: cause instanceof Error ? cause.message : "Online status could not sync." });
      }
    } finally { inFlight--; }
  }
  const pulse = (force = false) => { if (!stopped) void update(isVisible(), false, force); };
  const timer = setInterval(() => { if (isVisible()) pulse(); }, 30000);
  pulse();
  return { pulse, release: () => { if (!stopped) void update(false, true); }, stop: () => { stopped = true; clearInterval(timer); void update(false, true); } };
}
