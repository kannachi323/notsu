import { useEffect, useRef, useState } from "react";
import { Link, useBeforeUnload, useBlocker, useParams } from "react-router";
import { useAccountStore } from "../../accounts/accountStore";
import { loadReportContext, submitReport } from "../data/reports";
import { reasons, reasonLabels, type ReportContext, type ReportInput, type ReportReason, type ReportReceipt } from "../domain/reports";
import { ModerationLayout } from "./ModerationLayout";
import { ReportEvidence } from "./ReportEvidence";

export function ReportScreen() {
  const identity = useAccountStore(state => state.identity?.id), { target, message } = useParams();
  return <ReportForm key={`${identity}:${target}:${message}`} identity={identity} target={target ?? ""} messageId={message ?? null}/>;
}
function ReportForm({ identity, target, messageId }: { identity?: string; target: string; messageId: string | null }) {
  const [context, setContext] = useState<ReportContext | null>(null), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  const [reason, setReason] = useState<ReportReason | "">(""), [details, setDetails] = useState(""), [block, setBlock] = useState(false);
  const [busy, setBusy] = useState(false), [receipt, setReceipt] = useState<ReportReceipt | null>(null);
  const outbox = useRef<{ signature: string; input: ReportInput } | null>(null);
  const dirty = !receipt && (!!reason || !!details || block), blocker = useBlocker(dirty || busy);
  useBeforeUnload(event => { if (dirty || busy) { event.preventDefault(); event.returnValue = ""; } });
  useEffect(() => {
    setError(""); if (!identity) return;
    const controller = new AbortController();
    void loadReportContext(target, messageId, controller.signal).then(value => { if (!controller.signal.aborted) setContext(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Evidence could not load."); });
    return () => controller.abort();
  }, [identity, target, messageId, revision]);
  async function send() {
    if (!context || !reason || busy) return;
    const signature = JSON.stringify([target, messageId, reason, details, block]);
    if (outbox.current?.signature !== signature) outbox.current = { signature, input: { id: crypto.randomUUID(), targetId: target, messageId, reason, details, block } };
    setBusy(true); setError("");
    try { const result = await submitReport(outbox.current.input); if (useAccountStore.getState().identity?.id === identity) setReceipt(result); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The report could not be confirmed."); }
    finally { setBusy(false); }
  }
  return <ModerationLayout title="Report a concern">
    {!identity ? <section className="account-panel"><p>Sign in to submit a private report.</p><Link to="/account">Go to sign-in →</Link></section> : receipt ?
      <section className="account-panel"><h2>Report received</h2><p role="status">Your report is in the review queue.{block && " The player is also blocked."}</p><p>Reporting does not automatically penalize a player. The person you reported cannot see your report or your identity as its author.</p><Link className="account-guest" to="/reports">View your reports →</Link></section> :
      <section className="account-panel">
        <p className="account-muted">Help keep notsu welcoming. Share what happened; reports are reviewed privately. Only report a real concern.</p>
        {context ? <><ReportEvidence evidence={context}/><form onSubmit={event => { event.preventDefault(); void send(); }} aria-busy={busy}><fieldset disabled={busy}>
          <label>Reason<select required value={reason} onChange={event => setReason(event.target.value as ReportReason)}><option value="">Choose a reason</option>{reasons.map(value => <option key={value} value={value}>{reasonLabels[value]}</option>)}</select></label>
          <label>What happened?<textarea required rows={4} maxLength={4000} value={details} onChange={event => setDetails(event.target.value)}/><span className="account-hint">{[...details].length} / 2,000 characters. Include relevant context, not passwords or contact details.</span></label>
          <label className="report-check"><input type="checkbox" checked={block} onChange={event => setBlock(event.target.checked)}/>Also block this player and remove any friendship</label>
          <p className="account-muted">The server saves the relevant profile or received message as evidence. Report evidence can remain after account deletion: reviewed reports for 90 days, unreviewed reports for 180 days, then scheduled removal.</p>
          <button className="account-primary" disabled={!reason || !details.trim()} type="submit">{busy ? "Submitting…" : "Submit report"}</button>
        </fieldset></form></> : !error && <p role="status">Loading report evidence…</p>}
        {error && <p className="account-error" role="alert">{error} {!context && <button onClick={() => setRevision(value => value + 1)}>Retry</button>}</p>}
      </section>}
    {blocker.state === "blocked" && <section className="account-notice" role="alert"><p>{busy ? "Wait for this report request to finish." : receipt ? "Your report is saved. Continue?" : "Discard this report draft and leave?"}</p><div className="account-actions"><button disabled={busy} onClick={() => blocker.reset()}>Stay here</button><button disabled={busy} onClick={() => blocker.proceed()}>{receipt ? "Continue" : "Discard and leave"}</button></div></section>}
  </ModerationLayout>;
}
