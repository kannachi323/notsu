import { useCallback, useEffect, useRef, useState } from "react";
import { useAccountStore } from "../accounts/accountStore";
import { listConnections } from "./data/connections";
import type { ConnectionCursor, ConnectionItem, ConnectionList } from "./domain/connections";

export function useConnections(list: ConnectionList) {
  const identity = useAccountStore(state => state.identity);
  const [items, setItems] = useState<ConnectionItem[]>([]), [next, setNext] = useState<ConnectionCursor | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [loadedFor, setLoadedFor] = useState("");
  const currentScope = `${identity?.id ?? "guest"}:${list}`;
  const pending = useRef<AbortController | null>(null);
  const load = useCallback(async (cursor: ConnectionCursor | null) => {
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setLoadedFor(`${identity?.id ?? "guest"}:${list}`);
    if (!identity) { setItems([]); setNext(null); setError(""); setBusy(false); return; }
    setBusy(true); setError("");
    if (!cursor) { setItems([]); setNext(null); }
    try {
      const page = await listConnections(list, cursor, controller.signal);
      if (controller.signal.aborted) return;
      setItems(previous => cursor ? [...previous, ...page.items.filter(item => !previous.some(existing => existing.id === item.id))] : page.items);
      setNext(page.next);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load connections.");
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }, [identity?.id, list]);
  useEffect(() => { void load(null); return () => pending.current?.abort(); }, [load]);
  const current = loadedFor === currentScope;
  return { items: current ? items : [], next: current ? next : null, busy: current ? busy : !!identity, error: current ? error : "",
    refresh: () => void load(null), more: () => { if (current && !busy && next) void load(next); } };
}
