import { create } from "zustand";
import type { Visibility } from "./domain/presence";

interface PresenceState {
  userId: string | null;
  visibility: Visibility | null;
  connected: boolean;
  saving: boolean;
  error: string;
  generation: number;
  refresh: number;
}
const initial = { userId: null, visibility: null, connected: false, saving: false, error: "", generation: 0, refresh: 0 };
export const usePresenceStore = create<PresenceState>(() => initial);
export function resetPresence(userId: string | null) { usePresenceStore.setState({ ...initial, userId }); }
