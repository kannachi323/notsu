import { useEffect, useState } from "react";
import type { CompletedRun, RecordSource, SaveResult } from "./domain/records";
import { saveLocalRun } from "./data/service";

export type RecordSaveState = { id: string; phase: "saving" | "saved" | "error"; result?: SaveResult; error?: string };
export function useRecordSave(run: CompletedRun | null, source?: RecordSource) {
  const [state, setState] = useState<RecordSaveState | null>(null), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!run || !source) return;
    let current = true;
    setState({ id: run.id, phase: "saving" });
    // Saving may finish after leaving Results. Navigation cancels only the UI update.
    void saveLocalRun(run, source).then(result => { if (current) setState({ id: run.id, phase: "saved", result }); })
      .catch(cause => { if (current) setState({ id: run.id, phase: "error", error: cause instanceof Error ? cause.message : "The local record could not be saved." }); });
    return () => { current = false; };
  }, [run, source?.revision, source?.setId, source?.difficulty, retry]);
  return { state: state?.id === run?.id ? state : null, retry: () => setRetry(value => value + 1) };
}
