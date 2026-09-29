import { useCallback, useEffect, useRef, useState } from "react";
import { useAccountStore } from "../accounts/accountStore";
import { loadFriendPresence } from "./data/presence";
import { isOnline, type PresenceSnapshot } from "./domain/presence";

export function useFriendPresence(players: string[], revision = 0) {
  const id = useAccountStore(state => state.identity?.id), ids = [...new Set(players)].sort().join(",");
  const [rows, setRows] = useState<PresenceSnapshot[]>([]), [scope, setScope] = useState("");
  const [now, setNow] = useState(performance.now()), pending = useRef<AbortController | null>(null);
  const currentScope = `${id ?? "guest"}:${ids}`;
  const refresh = useCallback(async () => {
    pending.current?.abort(); const controller = new AbortController(); pending.current = controller;
    if (!id || !ids) { setRows([]); setScope(`${id ?? "guest"}:${ids}`); return; }
    try {
      const value = await loadFriendPresence(ids.split(","), controller.signal);
      if (!controller.signal.aborted) { setRows(value); setScope(`${id}:${ids}`); setNow(performance.now()); }
    } catch { if (!controller.signal.aborted) { setRows([]); setScope(`${id}:${ids}`); } }
  }, [id, ids]);
  useEffect(() => {
    void refresh();
    const focus = () => { if (document.visibilityState === "visible") void refresh(); };
    const interval = setInterval(focus, 30000);
    window.addEventListener("focus", focus); document.addEventListener("visibilitychange", focus);
    return () => { pending.current?.abort(); clearInterval(interval); window.removeEventListener("focus", focus); document.removeEventListener("visibilitychange", focus); };
  }, [refresh, revision]);
  useEffect(() => {
    const expires = Math.min(...rows.map(row => row.onlineUntil).filter(value => value > now));
    if (!Number.isFinite(expires)) return;
    const timer = setTimeout(() => setNow(performance.now()), Math.max(0, expires - performance.now()) + 1);
    return () => clearTimeout(timer);
  }, [rows, now]);
  return { get: (userId: string) => scope === currentScope ? isOnline(rows.find(row => row.userId === userId), now) : null, refresh: () => void refresh() };
}
