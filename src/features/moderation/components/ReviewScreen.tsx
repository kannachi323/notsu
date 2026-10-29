import { useEffect, useRef, useState } from "react";
import { useBeforeUnload, useBlocker, useParams } from "react-router";
import { useAccountStore } from "../../accounts/accountStore";
import { loadReport, reviewReport } from "../data/reports";
import { actionLabels, reasonLabels, type ReportDetail, type ReviewAction, type ReviewInput } from "../domain/reports";
import { ModerationLayout } from "./ModerationLayout";
import { ReportEvidence } from "./ReportEvidence";
import { Button, ButtonLink, EmptyState, Field, Icon, Loading, Notice, Panel } from "../../../shared/components";

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
  return <ModerationLayout title="Review report" back={{ to: "/moderation", label: "Review queue" }}
    actions={<Button variant="ghost" icon={<Icon name="refresh" />} disabled={busy || dirty || loading} onClick={() => setRevision(value => value + 1)}>Refresh report</Button>}>
    {!identity ? <EmptyState title="Reviewer sign-in required" description="Sign in with an authorized reviewer account." action={<ButtonLink variant="primary" to="/account">Go to sign-in</ButtonLink>} /> : <>
      {loading && <Loading>Loading private report…</Loading>}{error && <Notice tone="danger" role="alert">{error}</Notice>}{saved && <Notice tone="success" role="status">Decision saved and recorded.</Notice>}
      {report && <Panel title={reasonLabels[report.reason]} description={`Submitted ${new Date(report.createdAt).toLocaleString()} · ${report.status === "open" ? "Awaiting review" : "Reviewed"}`}>
        <ReportEvidence evidence={report.evidence}/>
        <h3 className="review-heading">Reporter’s context</h3><p className="ui-prose">{report.details}</p>
        <p className="ui-text-muted ui-text-small">Evidence was captured by the server. A report is an allegation, not proof of a violation. Reporter identity and private content must stay within authorized review.</p>
        {report.restriction && <Notice tone="warning">Community access is restricted until {new Date(report.restriction.until).toLocaleString()}.{!report.restriction.thisReport && " That restriction belongs to another review."}</Notice>}
        {choices.length > 0 && <form className="ui-form" onSubmit={event => { event.preventDefault(); setConfirm(true); }} aria-busy={busy}><fieldset disabled={busy || confirm}>
          <Field label="Decision"><select required value={action} onChange={event => setAction(event.target.value as ReviewAction)}><option value="">Choose a decision</option>{choices.map(value => <option key={value} value={value}>{actionLabels[value]}</option>)}</select></Field>
          <Field label="Decision explanation" hint={`${[...note].length} / 500 characters. Restriction explanations are shown to the player. Do not identify the reporter or quote private messages.`}><input required maxLength={1000} value={note} onChange={event => setNote(event.target.value)}/></Field>
          <div><Button variant="primary" type="submit" disabled={!action || !note.trim()}>Review decision</Button></div>
        </fieldset></form>}
        {confirm && action && <Notice tone="warning" title={actionLabels[action]} actions={<><Button size="sm" variant={action === "dismiss" ? "primary" : "danger"} disabled={busy} onClick={() => void apply()}>{busy ? "Applying…" : "Confirm decision"}</Button><Button size="sm" disabled={busy} onClick={() => setConfirm(false)}>Keep reviewing</Button></>}>
          <p className="ui-prose">{note}</p>
          <p>{action === "clear_profile" ? "This resets the current username, display name and bio if they still match the captured evidence." : action.startsWith("restrict_") ? "This hides the public profile and stops profile edits, friendships, messages and online status for the selected period. Offline play and account deletion remain available." : action === "lift_restriction" ? "This restores community access. It does not restore deleted content or friendships." : "This closes the report without changing the player's account."}</p>
        </Notice>}
        {dirty && !busy && <div><Button variant="ghost" onClick={() => { setAction(""); setNote(""); setConfirm(false); }}>Discard decision draft</Button></div>}
        {report.actions.length > 0 && <><h3 className="review-heading">Review history</h3><ol className="review-audit">{report.actions.map(item => <li key={item.id}><strong>{actionLabels[item.action]}</strong><p className="ui-prose">{item.note}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></li>)}</ol></>}
      </Panel>}
    </>}
    {blocker.state === "blocked" && <Notice tone="warning" role="alert" title={busy ? "Wait for the decision request to finish." : "Discard this decision draft and leave?"}
      actions={<><Button size="sm" disabled={busy} onClick={() => blocker.reset()}>Keep reviewing</Button><Button size="sm" variant="danger" disabled={busy} onClick={() => blocker.proceed()}>Discard and leave</Button></>} />}
  </ModerationLayout>;
}
