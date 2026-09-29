import { useEffect, useRef, useState } from "react";
import { Link, useBeforeUnload, useBlocker, useParams } from "react-router";
import { useAccountStore } from "../../accounts/accountStore";
import { loadReport, reviewReport } from "../data/reports";
import { actionLabels, reasonLabels, type ReportDetail, type ReviewAction, type ReviewInput } from "../domain/reports";
import { ModerationLayout } from "./ModerationLayout";
import { ReportEvidence } from "./ReportEvidence";

export function ReviewScreen() {
  const identity = useAccountStore(state => state.identity?.id), { id } = useParams();
  return <Review key={`${identity}:${id}`} identity={identity} id={id ?? ""}/>;
}
function Review({ identity, id }: { identity?: string; id: string }) {
  const [report, setReport] = useState<ReportDetail | null>(null), [revision, setRevision] = useState(0), [loading, setLoading] = useState(false);
  const [action, setAction] = useState<ReviewAction | "">(""), [note, setNote] = useState(""), [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false), [saved, setSaved] = useState(false), [error, setError] = useState("");
  const outbox = useRef<{ signature: string; value: ReviewInput } | null>(null), dirty = !!action || !!note, blocker = useBlocker(dirty || busy);
  useBeforeUnload(event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ""; } });
  useEffect(() => {
    if (!identity) return;
    const controller = new AbortController(); setLoading(true); setError(""); setReport(null);
    void loadReport(id, controller.signal).then(result => { if (!controller.signal.aborted) setReport(result); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "This report could not load."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [identity, id, revision]);
  const choices: ReviewAction[] = report?.status === "open" ? ["dismiss", ...(report.evidence.kind === "profile" && report.targetId ? ["clear_profile" as const] : []), ...(report.targetId && !report.restriction ? ["restrict_7d" as const, "restrict_30d" as const] : [])] : report?.restriction?.thisReport ? ["lift_restriction"] : [];
  async function apply() {
    if (!report || !action || busy || !confirm) return;
    const signature = JSON.stringify([report.revision, action, note]);
    if (outbox.current?.signature !== signature) outbox.current = { signature, value: { id: crypto.randomUUID(), revision: report.revision, action, note } };
    setBusy(true); setError(""); setSaved(false);
    try {
      const result = await reviewReport(id, outbox.current.value);
      if (useAccountStore.getState().identity?.id === identity) { setReport(result); setAction(""); setNote(""); setConfirm(false); setSaved(true); }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "The decision could not be confirmed."); }
    finally { setBusy(false); }
  }
  return <ModerationLayout title="Review report"><div className="account-actions"><Link to="/moderation">← Review queue</Link><button disabled={busy || dirty || loading} onClick={() => setRevision(value => value + 1)}>Refresh report</button></div>
    {!identity ? <p><Link to="/account">Sign in</Link> with an authorized reviewer account.</p> : <>
      {loading && <p role="status">Loading private report…</p>}{error && <p className="account-error" role="alert">{error}</p>}{saved && <p role="status" className="account-notice">Decision saved and recorded.</p>}
      {report && <section className="account-panel"><h2>{reasonLabels[report.reason]}</h2><p className="account-muted">Submitted {new Date(report.createdAt).toLocaleString()} · {report.status === "open" ? "Awaiting review" : "Reviewed"}</p>
        <ReportEvidence evidence={report.evidence}/><h3>Reporter’s context</h3><p className="report-text">{report.details}</p><p className="account-muted">Evidence was captured by the server. A report is an allegation, not proof of a violation. Reporter identity and private content must stay within authorized review.</p>
        {report.restriction && <p className="account-notice">Community access is restricted until {new Date(report.restriction.until).toLocaleString()}.{!report.restriction.thisReport && " That restriction belongs to another review."}</p>}
        {choices.length > 0 && <form onSubmit={event => { event.preventDefault(); setConfirm(true); }} aria-busy={busy}><fieldset disabled={busy || confirm}>
          <label>Decision<select required value={action} onChange={event => setAction(event.target.value as ReviewAction)}><option value="">Choose a decision</option>{choices.map(value => <option key={value} value={value}>{actionLabels[value]}</option>)}</select></label>
          <label>Decision explanation<input required maxLength={1000} value={note} onChange={event => setNote(event.target.value)}/><span className="account-hint">{[...note].length} / 500 characters. Restriction explanations are shown to the player. Do not identify the reporter or quote private messages.</span></label>
          <button className="account-primary" disabled={!action || !note.trim()}>Review decision</button>
        </fieldset></form>}
        {confirm && action && <section className="review-warning" aria-label="Confirm moderation decision"><h3>{actionLabels[action]}</h3><p>{note}</p><p>{action === "clear_profile" ? "This resets the current username, display name and bio if they still match the captured evidence." : action.startsWith("restrict_") ? "This hides the public profile and stops profile edits, friendships, messages and online status for the selected period. Offline play and account deletion remain available." : action === "lift_restriction" ? "This restores community access. It does not restore deleted content or friendships." : "This closes the report without changing the player's account."}</p>
          <div className="account-actions"><button disabled={busy} onClick={() => void apply()}>{busy ? "Applying…" : "Confirm decision"}</button><button disabled={busy} onClick={() => setConfirm(false)}>Keep reviewing</button></div></section>}
        {dirty && !busy && <button onClick={() => { setAction(""); setNote(""); setConfirm(false); }}>Discard decision draft</button>}
        {report.actions.length > 0 && <><h3>Review history</h3><ol className="review-audit">{report.actions.map(item => <li key={item.id}><strong>{actionLabels[item.action]}</strong><p>{item.note}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></li>)}</ol></>}
      </section>}
    </>}
    {blocker.state === "blocked" && <section className="account-notice" role="alert"><p>{busy ? "Wait for the decision request to finish." : "Discard this decision draft and leave?"}</p><div className="account-actions"><button disabled={busy} onClick={() => blocker.reset()}>Keep reviewing</button><button disabled={busy} onClick={() => blocker.proceed()}>Discard and leave</button></div></section>}
  </ModerationLayout>;
}
