import { useEffect, useState } from "react";
import { useAccountStore } from "../../accounts/accountStore";
import { loadReports } from "../data/reports";
import type { ReportPage } from "../domain/reports";
import { reasonLabels } from "../domain/reports";
import type { ConnectionCursor } from "../../friends/domain/connections";
import { ModerationLayout } from "./ModerationLayout";
import { Avatar, Badge, Button, ButtonLink, EmptyState, Icon, List, ListItem, Loading, Notice, Tabs } from "../../../shared/components";
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
  const select = (next: "open" | "reviewed") => { setQueue(next); setCursor(null); setPage({ items: [], next: null }); setRevision(value => value + 1); };
  const statusLabel = { open: "Awaiting review", dismissed: "Reviewed · closed" } as Record<string, string>;
  return <ModerationLayout title={review ? "Report review" : "Your reports"}
    description={review ? "Private review queue. Reports involving your own account are excluded. Decisions require a reason and are recorded." : "Only you and authorized reviewers can access your reports. A report does not automatically penalize another player."}
    actions={id && <Button variant="ghost" icon={<Icon name="refresh" />} disabled={busy} onClick={refresh}>Refresh</Button>}>
    {!id ? <EmptyState title="Sign in to view reports" action={<ButtonLink variant="primary" to="/account">Go to sign-in</ButtonLink>} /> : <>
      {review && <Tabs label="Review queue" items={[{ value: "open", label: "Open" }, { value: "reviewed", label: "Reviewed" }]} value={queue} onChange={select} />}
      {error && <Notice tone="danger" role="alert">{error}</Notice>}
      {page.items.length > 0 && <List label={review ? "Review queue" : "Your reports"}>{page.items.map(item => <ListItem key={item.id}
        leading={<Avatar name={item.targetName} />}
        title={item.targetName}
        subtitle={`${item.kind === "message" ? "Message" : "Profile"} · ${reasonLabels[item.reason]}`}
        meta={<time className="ui-text-muted" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString()}</time>}
        actions={<><Badge tone={item.status === "open" ? "warning" : item.status === "dismissed" ? "neutral" : "violet"}>{statusLabel[item.status] ?? "Reviewed · action taken"}</Badge>
          {review && <ButtonLink size="sm" to={`/moderation/${item.id}`}>Review</ButtonLink>}</>} />)}
      </List>}
      {busy && <Loading>Loading reports…</Loading>}
      {!busy && !error && !page.items.length && <EmptyState title={review ? "This queue is clear" : "No reports yet"} description={review ? "Reports will appear here when submitted." : "Report a concern from a player profile or a received message."} />}
      {page.next && <div><Button disabled={busy} onClick={() => setCursor(page.next)}>Load more</Button></div>}
    </>}
  </ModerationLayout>;
}
