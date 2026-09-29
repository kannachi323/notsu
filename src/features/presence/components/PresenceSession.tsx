import { useEffect, useRef } from "react";
import { useAccountStore } from "../../accounts/accountStore";
import { resetPresence, usePresenceStore } from "../presenceStore";
import { startPresenceHeartbeat } from "../data/heartbeat";

export function PresenceSession({ userId }: { userId: string }) {
  const refresh = usePresenceStore(state => state.refresh), profile = useAccountStore(state => state.profile?.id);
  const session = useRef<ReturnType<typeof startPresenceHeartbeat> | null>(null);
  useEffect(() => {
    resetPresence(userId);
    const heartbeat = startPresenceHeartbeat(userId, () => document.visibilityState === "visible" && navigator.onLine);
    session.current = heartbeat;
    const change = () => heartbeat.pulse(), leave = () => heartbeat.release();
    document.addEventListener("visibilitychange", change); window.addEventListener("online", change); window.addEventListener("offline", change);
    window.addEventListener("pagehide", leave); window.addEventListener("pageshow", change);
    return () => {
      heartbeat.stop(); session.current = null;
      document.removeEventListener("visibilitychange", change); window.removeEventListener("online", change); window.removeEventListener("offline", change);
      window.removeEventListener("pagehide", leave); window.removeEventListener("pageshow", change);
      if (usePresenceStore.getState().userId === userId) resetPresence(null);
    };
  }, [userId]);
  useEffect(() => { session.current?.pulse(true); }, [refresh, profile]);
  return null;
}
