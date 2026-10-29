import { useEffect, useRef, useState } from "react";
import { useBeforeUnload, useBlocker, useParams } from "react-router";
import { useAccountStore } from "../../accounts/accountStore";
import { loadReportContext, submitReport } from "../data/reports";
import { reasons, reasonLabels, type ReportContext, type ReportInput, type ReportReason, type ReportReceipt } from "../domain/reports";
import { ModerationLayout } from "./ModerationLayout";
import { ReportEvidence } from "./ReportEvidence";
import { Button, ButtonLink, Checkbox, EmptyState, Field, Loading, Notice, Panel } from "../../../shared/components";

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
  return <ModerationLayout title="Report a concern" description="Help keep notsu welcoming. Reports are reviewed privately. Only report a real concern.">
    {!identity ? <EmptyState title="Sign in to report" description="Sign in to submit a private report." action={<ButtonLink variant="primary" to="/account">Go to sign-in</ButtonLink>} /> : receipt ?
      <Panel title="Report received">
        <Notice tone="success" role="status">Your report is in the review queue.{block && " The player is also blocked."}</Notice>
        <p className="ui-text-muted">Reporting does not automatically penalize a player. The person you reported cannot see your report or your identity as its author.</p>
        <div><ButtonLink to="/reports">View your reports</ButtonLink></div>
      </Panel> :
      <Panel title="What happened?">
        {context ? <><ReportEvidence evidence={context}/><form className="ui-form" onSubmit={event => { event.preventDefault(); void send(); }} aria-busy={busy}><fieldset disabled={busy}>
          <Field label="Reason"><select required value={reason} onChange={event => setReason(event.target.value as ReportReason)}><option value="">Choose a reason</option>{reasons.map(value => <option key={value} value={value}>{reasonLabels[value]}</option>)}</select></Field>
          <Field label="Details" hint={`${[...details].length} / 2,000 characters. Include relevant context, not passwords or contact details.`}><textarea required rows={4} maxLength={4000} value={details} onChange={event => setDetails(event.target.value)}/></Field>
          <Checkbox label="Also block this player and remove any friendship" checked={block} onChange={event => setBlock(event.target.checked)}/>
          <p className="ui-text-muted ui-text-small">The server saves the relevant profile or received message as evidence. Report evidence can remain after account deletion: reviewed reports for 90 days, unreviewed reports for 180 days, then scheduled removal.</p>
          <div><Button variant="primary" disabled={!reason || !details.trim()} type="submit">{busy ? "Submitting…" : "Submit report"}</Button></div>
        </fieldset></form></> : !error && <Loading>Loading report evidence…</Loading>}
        {error && <Notice tone="danger" role="alert" actions={!context && <Button size="sm" onClick={() => setRevision(value => value + 1)}>Retry</Button>}>{error}</Notice>}
      </Panel>}
    {blocker.state === "blocked" && <Notice tone="warning" role="alert" title={busy ? "Wait for this report request to finish." : receipt ? "Your report is saved. Continue?" : "Discard this report draft and leave?"}
      actions={<><Button size="sm" disabled={busy} onClick={() => blocker.reset()}>Stay here</Button><Button size="sm" variant={receipt ? "secondary" : "danger"} disabled={busy} onClick={() => blocker.proceed()}>{receipt ? "Continue" : "Discard and leave"}</Button></>} />}
  </ModerationLayout>;
}
