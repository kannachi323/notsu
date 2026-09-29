import { useEffect, useState } from "react";
import { useAccountStore } from "../accounts/accountStore";
import { useAccountUpdates } from "../accounts/useAccountUpdates";
import { loadModerationAccess } from "./data/reports";
import type { ModerationAccess } from "./domain/reports";
export function useModerationAccess() {
  const id = useAccountStore(state => state.identity?.id), [value, setValue] = useState<ModerationAccess | null>(null), [scope, setScope] = useState<string>();
  const [revision, setRevision] = useState(0), [error, setError] = useState("");
  useAccountUpdates(() => setRevision(value => value + 1));
  useEffect(() => {
    if (!id) { setValue(null); setScope(undefined); return; }
    const controller = new AbortController(); setError("");
    void loadModerationAccess(controller.signal).then(result => { if (!controller.signal.aborted) { setValue(result); setScope(id); } })
      .catch(cause => { if (!controller.signal.aborted) { setValue(null); setError(cause instanceof Error ? cause.message : "Community access could not load."); } });
    return () => controller.abort();
  }, [id, revision]);
  const result = scope === id ? value : null;
  useEffect(() => {
    if (!result?.restriction) return;
    const timer = setTimeout(() => setRevision(value => value + 1), Math.max(1000, Math.min(2147483647, Date.parse(result.restriction.until) - Date.now() + 1000)));
    return () => clearTimeout(timer);
  }, [result]);
  return { value: result, error, refresh: () => setRevision(value => value + 1) };
}
