import { useEffect, useRef, useState } from "react";
import { bestRecord, runDescription } from "../domain/records";
import type { LocalRecord } from "../domain/records";
import { listRecords, RECORDS_CHANGED, removeRecord, restoreRecord } from "../data/storage";
import type { RemovedRecord } from "../data/storage";
import { RULES_VERSION } from "../../rhythm/domain/rules";
import "../records.css";

type Props = { revision: string; chartId: string; busy: boolean; watch: (id: string) => void };
export function RecordPanel({ revision, chartId, busy, watch }: Props) {
  const [rows, setRows] = useState<LocalRecord[]>([]), [error, setError] = useState(""), [unreadable, setUnreadable] = useState(0);
  const [loading, setLoading] = useState(true), [working, setWorking] = useState(false), [limit, setLimit] = useState(5);
  const [removed, setRemoved] = useState<RemovedRecord | null>(null);
  const alive = useRef(false), generation = useRef(0);
  async function refresh() {
    const token = ++generation.current; setLoading(true);
    try { const result = await listRecords(revision, chartId); if (alive.current && token === generation.current) { setRows(result.records); setUnreadable(result.unreadable); setError(""); } }
    catch (cause) { if (alive.current && token === generation.current) setError(cause instanceof Error ? cause.message : "Could not read local records."); }
    finally { if (alive.current && token === generation.current) setLoading(false); }
  }
  useEffect(() => {
    alive.current = true; void refresh();
    const update = () => { void refresh(); };
    window.addEventListener(RECORDS_CHANGED, update); window.addEventListener("focus", update);
    return () => { alive.current = false; generation.current++; window.removeEventListener(RECORDS_CHANGED, update); window.removeEventListener("focus", update); };
  }, [revision, chartId]);
  async function remove(id: string) {
    if (working) return; setWorking(true); setError("");
    try { const result = await removeRecord(id); if (alive.current) setRemoved(result); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Could not remove this attempt."); }
    finally { if (alive.current) setWorking(false); }
  }
  async function undo() {
    if (!removed || working) return; setWorking(true); setError("");
    try { await restoreRecord(removed); if (alive.current) setRemoved(null); }
    catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : "Could not restore this attempt."); }
    finally { if (alive.current) setWorking(false); }
  }
  const best = bestRecord(rows), disabled = busy || working;
  return <section className="record-panel" aria-label="Local records">
    <div className="record-heading"><h3>Personal best</h3><button disabled={disabled || loading} onClick={() => void refresh()}>Refresh records</button></div>
    <p className="record-help">Standard clears · this revision · local, unranked</p>
    {best ? <div className="record-best"><strong>{best.summary.score.toLocaleString()} <span>points</span></strong><p>{best.summary.accuracy.toFixed(2)}% accuracy · {best.summary.maxCombo} combo</p>
      <button disabled={disabled} onClick={() => watch(best.id)}>Watch best replay</button></div> : !loading && <p className="record-empty">Complete this difficulty without assists to set your first personal best.</p>}
    {loading && <p role="status">Loading records…</p>}{error && <p className="record-error" role="alert">{error}</p>}
    {!!unreadable && <p className="record-error">{unreadable} damaged records could not be displayed.</p>}
    {removed && <div className="record-undo" role="status"><p>Removed the attempt from {new Date(removed.record.finishedAt).toLocaleString()}. Undo is available until you leave this view or remove another attempt.</p><button disabled={disabled} onClick={() => void undo()}>Undo record removal</button></div>}
    <details className="record-history"><summary>Recent attempts ({rows.length})</summary>
      <p className="record-help">Practice and failed runs stay in history. Replay playback does not create another attempt. Records remain when a map is removed; reimport the same package to watch them.</p>
      {!rows.length && !loading && <p className="record-empty">Your finished attempts will appear here.</p>}
      <ol>{rows.slice(0, limit).map(row => <li key={row.id} aria-label={`Attempt from ${new Date(row.finishedAt).toLocaleString()}`}>
        <div className="record-attempt-heading"><strong>{row.summary.score.toLocaleString()}</strong><span>{row.summary.status === "failed" ? "Failed" : "Completed"}{row.id === best?.id ? " · Best" : ""}</span></div>
        <p>{runDescription(row)}</p><p>{row.summary.accuracy.toFixed(2)}% · {row.summary.maxCombo} combo</p><time dateTime={new Date(row.finishedAt).toISOString()}>{new Date(row.finishedAt).toLocaleString()}</time>
        <div className="record-actions"><button disabled={disabled} onClick={() => watch(row.id)}>Watch replay</button><button disabled={disabled} onClick={() => void remove(row.id)}>Remove attempt</button></div>
      </li>)}</ol>
      {rows.length > limit && <button onClick={() => setLimit(value => value + 10)}>Show more attempts</button>}
      <p className="record-help">Rules {RULES_VERSION} · up to 1,000 attempts / 128 MB on this device. No automatic deletion.</p>
    </details>
  </section>;
}
