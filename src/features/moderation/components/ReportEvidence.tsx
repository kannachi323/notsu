import type { ReportContext } from "../domain/reports";
export function ReportEvidence({ evidence }: { evidence: ReportContext }) {
  return <section className="report-evidence" aria-label="Report evidence">
    <h2>{evidence.kind === "message" ? "Received message" : "Player profile"}</h2>
    <p><strong>{evidence.displayName}</strong>{evidence.username && <span className="account-muted"> @{evidence.username}</span>}</p>
    {evidence.message ? <><blockquote>{evidence.message.body}</blockquote><time dateTime={evidence.message.createdAt}>{new Date(evidence.message.createdAt).toLocaleString()}</time></> : <p className="report-text">{evidence.bio || "No bio."}</p>}
  </section>;
}
