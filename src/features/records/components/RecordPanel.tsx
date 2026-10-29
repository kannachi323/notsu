import { useEffect, useRef, useState } from "react";
import { bestRecord, runDescription } from "../domain/records";
import type { LocalRecord } from "../domain/records";
import { listRecords, RECORDS_CHANGED, removeRecord, restoreRecord } from "../data/storage";
import type { RemovedRecord } from "../data/storage";
import { RULES_VERSION } from "../../rhythm/domain/rules";
import { Badge, Button, Icon, IconButton, Loading, Notice, SectionHeader } from "../../../shared/components";
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
    <SectionHeader level={3} title="Personal best" description="Standard clears · this revision · local, unranked"
      actions={<IconButton size="sm" label="Refresh records" icon={<Icon name="refresh" />} disabled={disabled || loading} onClick={() => void refresh()} />} />
    {best ? <div className="record-best">
      <div><strong>{best.summary.score.toLocaleString()}</strong><p>{best.summary.accuracy.toFixed(2)}% accuracy · {best.summary.maxCombo}× combo</p></div>
      <Button size="sm" icon={<Icon name="play" />} disabled={disabled} onClick={() => watch(best.id)}>Watch replay</Button>
    </div> : !loading && <p className="record-empty">Complete this difficulty without assists to set your first personal best.</p>}
    {loading && <Loading>Loading records…</Loading>}{error && <Notice tone="danger" role="alert">{error}</Notice>}
    {!!unreadable && <Notice tone="warning">{unreadable} damaged records could not be displayed.</Notice>}
    {removed && <Notice role="status" actions={<Button size="sm" disabled={disabled} onClick={() => void undo()}>Undo record removal</Button>}>Removed the attempt from {new Date(removed.record.finishedAt).toLocaleString()}. Undo is available until you leave this view or remove another attempt.</Notice>}
    <details className="record-history"><summary>Recent attempts ({rows.length})</summary>
      <p className="record-help">Practice and failed runs stay in history. Replay playback does not create another attempt. Records remain when a map is removed; reimport the same package to watch them.</p>
      {!rows.length && !loading && <p className="record-empty">Your finished attempts will appear here.</p>}
      <ol>{rows.slice(0, limit).map(row => <li key={row.id} aria-label={`Attempt from ${new Date(row.finishedAt).toLocaleString()}`}>
        <div className="record-attempt-heading"><strong>{row.summary.score.toLocaleString()}</strong><Badge tone={row.summary.status === "failed" ? "danger" : row.id === best?.id ? "accent" : "neutral"}>{row.summary.status === "failed" ? "Failed" : "Completed"}{row.id === best?.id ? " · Best" : ""}</Badge></div>
        <p>{runDescription(row)} · {row.summary.accuracy.toFixed(2)}% · {row.summary.maxCombo}× combo</p><time dateTime={new Date(row.finishedAt).toISOString()}>{new Date(row.finishedAt).toLocaleString()}</time>
        <div className="ui-cluster"><Button size="sm" disabled={disabled} onClick={() => watch(row.id)}>Watch replay</Button><Button size="sm" variant="ghost" disabled={disabled} onClick={() => void remove(row.id)}>Remove attempt</Button></div>
      </li>)}</ol>
      {rows.length > limit && <Button size="sm" variant="ghost" onClick={() => setLimit(value => value + 10)}>Show more attempts</Button>}
      <p className="record-help">Rules {RULES_VERSION} · up to 1,000 attempts / 128 MB on this device. No automatic deletion.</p>
    </details>
  </section>;
}
