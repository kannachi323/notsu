import { DraftConflict } from "../data/storage";
import type { DraftWriter } from "../data/DraftWriter";

export function DraftRecovery({ writer, busy, recover }: { writer: DraftWriter | null; busy: boolean; recover: (copy: boolean) => Promise<void> }) {
  if (writer && !writer.error) return null;
  const conflict = writer?.error instanceof DraftConflict;
  return <section className="editor-recovery" aria-label="Recover unsaved edits">
    <h2>{conflict ? "Keep both versions" : "Your edits are still in this window"}</h2>
    <p>{conflict ? "Another window changed or moved the saved draft. Create a separate map set from your current edits, including every circle, movement and the original recording. The saved version stays intact." : "Retry when storage is available, or save these edits as a separate map set. Keep this window open until saving succeeds; you can also use Back up draft below."}</p>
    <div className="editor-small-actions">{!conflict && <button disabled={busy} onClick={() => void recover(false)}>Retry save</button>}
      <button disabled={busy} onClick={() => void recover(true)}>Save recovery copy</button></div>
  </section>;
}
