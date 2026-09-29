import { useAccountStore } from "../../accounts/accountStore";
import { usePresenceStore } from "../presenceStore";
import type { Visibility } from "../domain/presence";
import { setVisibility } from "./presence";

export async function saveVisibility(value: Visibility) {
  const state = usePresenceStore.getState(), id = useAccountStore.getState().identity?.id;
  if (!id || state.userId !== id || state.saving) return;
  const generation = state.generation + 1;
  usePresenceStore.setState({ generation, saving: true, error: "" });
  try {
    const result = await setVisibility(id, value);
    if (useAccountStore.getState().identity?.id !== id || usePresenceStore.getState().generation !== generation) return;
    usePresenceStore.setState({ visibility: result, connected: false });
  } catch (cause) {
    if (useAccountStore.getState().identity?.id === id && usePresenceStore.getState().generation === generation) usePresenceStore.setState({ error: cause instanceof Error ? cause.message : "Your visibility change could not be confirmed." });
  } finally {
    if (useAccountStore.getState().identity?.id === id && usePresenceStore.getState().generation === generation) usePresenceStore.setState(state => ({ saving: false, generation: generation + 1, refresh: state.refresh + 1 }));
  }
}
