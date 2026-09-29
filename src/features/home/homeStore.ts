import { create } from "zustand";

interface HomeState {
  musicOpen: boolean;
  toggleMusic: () => void;
  closeMusic: () => void;
}

// Transient shell state only. Playback and rhythm timing belong to their features.
export const useHomeStore = create<HomeState>()((set) => ({
  musicOpen: false,
  toggleMusic: () => set((state) => ({ musicOpen: !state.musicOpen })),
  closeMusic: () => set({ musicOpen: false }),
}));
