import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAccountStore } from "../../accounts/accountStore";
import { loadReports } from "../data/reports";
import type { ReportPage } from "../domain/reports";
import { reasonLabels } from "../domain/reports";
import type { ConnectionCursor } from "../../friends/domain/connections";
import { ModerationLayout } from "./ModerationLayout";
export function ReportsScreen({ review = false }: { review?: boolean }) {
  const id = useAccountStore(state => state.identity?.id);
  return <ReportList key={`${id}:${review}`} id={id} review={review}/>;
}
function ReportList({ id, review }: { id?: string; review: boolean }) {
  const [queue, setQueue] = useState<"open" | "reviewed">("open"), [revision, setRevision] = useState(0);
  const [cursor, setCursor] = useState<ConnectionCursor | null>(null), [page, setPage] = useState<ReportPage>({ items: [], next: null });
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const refresh = () => { setCursor(null); setRevision(value => value + 1); };
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController(); setBusy(true); setError("");
    void loadReports(review ? queue : "own", cursor, controller.signal).then(result => { if (!controller.signal.aborted) setPage(old => ({ items: cursor ? [...old.items, ...result.items.filter(item => !old.items.some(existing => existing.id === item.id))] : result.items, next: result.next })); })
      .catch(cause => { if (!controller.signal.aborted) { setPage({ items: [], next: null }); setError(cause instanceof Error ? cause.message : "Reports could not load."); } })
      .finally(() => { if (!controller.signal.aborted) setBusy(false); });
    return () => controller.abort();
  }, [id, review, queue, cursor, revision]);
  return <ModerationLayout title={review ? "Report review" : "Your reports"}>
    {!id ? <section className="account-panel"><p>Sign in to view reports.</p><Link to="/account">Go to sign-in →</Link></section> : <>
      <p className="account-muted">{review ? "Private review queue. Reports involving your own account are excluded. Decisions require a reason and are recorded." : "Only you and authorized reviewers can access your reports. A report does not automatically penalize another player."}</p>
      <div className="account-actions">{review && <><button aria-pressed={queue === "open"} onClick={() => { setQueue("open"); setCursor(null); setPage({ items: [], next: null }); setRevision(value => value + 1); }}>Open</button><button aria-pressed={queue === "reviewed"} onClick={() => { setQueue("reviewed"); setCursor(null); setPage({ items: [], next: null }); setRevision(value => value + 1); }}>Reviewed</button></>}<button disabled={busy} onClick={refresh}>Refresh</button></div>
      {error && <p className="account-error" role="alert">{error}</p>}
      <ul className="report-list">{page.items.map(item => <li key={item.id}><div><strong>{item.targetName}</strong><p>{item.kind === "message" ? "Message" : "Profile"} · {reasonLabels[item.reason]}</p><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time></div><div><span className="report-status">{item.status === "open" ? "Awaiting review" : item.status === "dismissed" ? "Reviewed · closed" : "Reviewed · action taken"}</span>{review && <Link className="account-guest" to={`/moderation/${item.id}`}>Review →</Link>}</div></li>)}</ul>
      {busy && <p role="status">Loading reports…</p>}{!busy && !error && !page.items.length && <section className="account-panel"><h2>{review ? "This queue is clear" : "No reports yet"}</h2><p>{review ? "Reports will appear here when submitted." : "Report a concern from a player profile or a received message."}</p></section>}
      {page.next && <button disabled={busy} onClick={() => setCursor(page.next)}>Load more</button>}
    </>}
  </ModerationLayout>;
}
