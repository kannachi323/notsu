import type { ReportContext } from "../domain/reports";
import { Avatar, Panel } from "../../../shared/components";
export function ReportEvidence({ evidence }: { evidence: ReportContext }) {
  return <Panel variant="raised" aria-label="Report evidence" className="report-evidence">
    <p className="report-evidence-kind">{evidence.kind === "message" ? "Received message" : "Player profile"}</p>
    <div className="report-evidence-author"><Avatar name={evidence.displayName} size="sm" /><strong>{evidence.displayName}</strong>{evidence.username && <span className="ui-text-muted"> @{evidence.username}</span>}</div>
    {evidence.message ? <><blockquote>{evidence.message.body}</blockquote><time dateTime={evidence.message.createdAt}>{new Date(evidence.message.createdAt).toLocaleString()}</time></> : <p className="ui-prose">{evidence.bio || "No bio."}</p>}
  </Panel>;
}
