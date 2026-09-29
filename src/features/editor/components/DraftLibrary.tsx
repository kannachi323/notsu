import { useState } from "react";
import type { DraftSummary } from "../data/storage";
import type { TrashedDraft } from "../data/trash";

type Props = {
  drafts: DraftSummary[]; trash: TrashedDraft[]; busy: boolean; notice: string;
  open: (id: string) => Promise<void>; refresh: () => Promise<void>;
  manage: (action: "trash" | "restore" | "purge", draft: DraftSummary | TrashedDraft) => Promise<void>;
};
export function DraftLibrary({ drafts, trash, busy, notice, open, refresh, manage }: Props) {
  const [view, setView] = useState<"drafts" | "trash">("drafts"), [query, setQuery] = useState("");
  const [sort, setSort] = useState("recent"), [removing, setRemoving] = useState<TrashedDraft | null>(null);
  const terms = query.toLocaleLowerCase().trim().split(/\s+/);
  const rows = (view === "drafts" ? drafts : trash).filter(row => terms.every(term => `${row.title} ${row.artist} ${row.difficulty}`.toLocaleLowerCase().includes(term)))
    .sort((a, b) => sort === "title" ? a.title.localeCompare(b.title) || a.difficulty.localeCompare(b.difficulty) : view === "trash" ? (b as TrashedDraft).trashedAt - (a as TrashedDraft).trashedAt : b.updatedAt - a.updatedAt);
  return <section className="editor-drafts" aria-label="Draft library">
    <h2>Your drafts <span>{drafts.length + trash.length}/50</span></h2>
    <div className="editor-small-actions editor-library-views" aria-label="Draft collection">
      <button aria-pressed={view === "drafts"} onClick={() => { setView("drafts"); setRemoving(null); }}>Drafts ({drafts.length})</button>
      <button aria-pressed={view === "trash"} onClick={() => { setView("trash"); setRemoving(null); }}>Trash ({trash.length})</button>
      <button disabled={busy} onClick={() => void refresh()}>Refresh</button>
    </div>
    <div className="editor-library-filters"><label>Search drafts<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Song, artist or difficulty" /></label>
      <label>Sort<select value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Most recent</option><option value="title">Title</option></select></label></div>
    {view === "trash" && <p className="editor-hint">Trash keeps your circles, movements and recording until you restore or permanently remove a draft. It still counts toward device storage.</p>}
    <p className="editor-library-status" role="status">{notice}</p>
    {!rows.length && <p className="muted">{query ? "No drafts match your search." : view === "trash" ? "Trash is empty." : "Saved maps appear here, ready for your next session."}</p>}
    {rows.map(draft => <article className="editor-draft-card" key={draft.id} aria-label={`${draft.title} · ${draft.difficulty}`}>
      <div className="editor-draft-info"><strong>{draft.title}</strong><span>{draft.artist} · {draft.difficulty}</span>
        <small>{draft.notes} circles · {draft.updatedAt ? new Date(draft.updatedAt).toLocaleDateString() : "Could not read saved data"}</small></div>
      <div className="editor-small-actions">
        {view === "drafts" ? <><button disabled={busy} onClick={() => void open(draft.id)}>Open draft</button>
          <button disabled={busy || !draft.version} onClick={() => void manage("trash", draft)}>Move to Trash</button></> : <>
          <button disabled={busy || !draft.version} onClick={() => void manage("restore", draft)}>Restore draft</button>
          <button disabled={busy} onClick={() => setRemoving(draft as TrashedDraft)}>Remove permanently…</button></>}
      </div>
      {removing?.id === draft.id && view === "trash" && <section className="editor-delete-confirm" aria-label="Confirm permanent removal">
        <p>Permanently remove <strong>{draft.difficulty}</strong> from this device? This cannot be undone. Its recording is removed only when no other draft needs it. Exported packages and Browse maps stay available.</p>
        <div className="editor-small-actions"><button disabled={busy} onClick={() => setRemoving(null)}>Keep in Trash</button>
          <button className="editor-danger" disabled={busy} onClick={async () => { await manage("purge", removing); setRemoving(null); }}>Permanently remove draft</button></div>
      </section>}
    </article>)}
  </section>;
}
