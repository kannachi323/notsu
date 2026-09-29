import { create } from "zustand";
import type { Profile } from "./domain/profile";

export interface AccountIdentity { id: string; email: string }
interface AccountState {
  identity: AccountIdentity | null;
  recovery: boolean;
  profile: Profile | null;
  profileStatus: "idle" | "loading" | "ready" | "error";
  profileError: string;
  profileDirty: boolean;
  profileSaving: boolean;
}
// No credentials, tokens, persistence middleware or browser storage.
export const useAccountStore = create<AccountState>(() => ({
  identity: null, recovery: false, profile: null, profileStatus: "idle", profileError: "", profileDirty: false, profileSaving: false,
}));

export function acceptIdentity(identity: AccountIdentity | null, recovery = false) {
  const previous = useAccountStore.getState();
  useAccountStore.setState({ identity, recovery,
    ...(previous.identity?.id !== identity?.id || !identity
      ? { profile: null, profileStatus: "idle", profileError: "", profileDirty: false, profileSaving: false } : {}),
  });
}
