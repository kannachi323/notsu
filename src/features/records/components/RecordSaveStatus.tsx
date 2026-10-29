import type { RecordSaveState } from "../useRecordSave";
const messages = {
  first: "First clear · personal best saved", improved: "New personal best saved", tied: "Personal best matched · replay saved",
  unchanged: "Result and replay saved", practice: "Practice run saved",
  failed: "Attempt and replay saved", "already-saved": "Already saved",
};
export function RecordSaveStatus({ state, retry }: { state: RecordSaveState | null; retry: () => void }) {
  if (!state) return null;
  return <div className={`record-save ${state.phase === "error" ? "record-save-error" : ""}`}>
    <p role={state.phase === "error" ? "alert" : "status"}>{state.phase === "saving" ? "Saving…" : state.phase === "saved" && state.result ? messages[state.result.outcome] : state.error}</p>
    {state.phase === "error" && <button onClick={retry}>Retry record save</button>}
  </div>;
}
