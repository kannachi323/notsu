import type { RecordSaveState } from "../useRecordSave";
const messages = {
  first: "First Standard clear saved · personal best", improved: "New personal best saved", tied: "Personal best matched · replay saved",
  unchanged: "Result and replay saved", practice: "Practice result and replay saved · excluded from personal best",
  failed: "Failed attempt and replay saved · excluded from personal best", "already-saved": "Result and replay already saved",
};
export function RecordSaveStatus({ state, retry }: { state: RecordSaveState | null; retry: () => void }) {
  if (!state) return null;
  return <div className={`record-save ${state.phase === "error" ? "record-save-error" : ""}`}>
    <p role={state.phase === "error" ? "alert" : "status"}>{state.phase === "saving" ? "Checking replay and saving on this device…" : state.phase === "saved" && state.result ? messages[state.result.outcome] : state.error}</p>
    {state.phase === "error" && <button onClick={retry}>Retry record save</button>}
    <p className="record-help">Local records are unranked. Find this revision’s attempts and replays in Browse.</p>
  </div>;
}
