import { useEffect, useState } from "react";
import { useSearchParams } from "react-router";
import { AppScreen } from "../../home/components/AppScreen";
import { Badge, Button, ButtonLink, Checkbox, EmptyState, Field, Icon, IconButton, List, ListItem, Loading, Notice, Page, PageHeader, Panel, buttonClass } from "../../../shared/components";
import "../publishing.css";
import { configuration, configurationIssue } from "../../accounts/data/auth";
import { useMapLibrary } from "../useMapLibrary";
import { usePublications } from "../usePublications";
import { ONLINE_MAP_BYTES } from "../domain/published";

export function PublishScreen() {
  const [params] = useSearchParams(), library = useMapLibrary(params.get("map") ?? undefined), publications = usePublications();
  const [rights,setRights] = useState(false);
  const { selected } = library, { userId,profile } = publications;
  useEffect(()=>setRights(false),[selected?.revision,userId]);
  const busy = library.busy || publications.busy;
  const valid = !!selected && selected.bytes.length<=ONLINE_MAP_BYTES && selected.set.difficulties.every(d=>d.chart.notes.length>0);
  return <AppScreen><Page>
    <PageHeader back={{ to: "/browse?source=online", label: "Browse maps" }} icon="upload" eyebrow="Creator · Community" title="Share your rhythm"
      description="Publish a complete song pack. Each revision keeps its own music and difficulties." />
    {!configuration ? <EmptyState title="Online publishing is unavailable" description={configurationIssue || "Online services are not configured in this build. Keep creating and exporting packs locally."}
      action={<ButtonLink variant="primary" to="/editor" icon={<Icon name="editor" />}>Open the editor</ButtonLink>} /> :
      !userId ? <EmptyState title="A home for your maps" description="Sign in with a verified email and create your public profile to publish." action={<ButtonLink variant="primary" to="/account">Sign in</ButtonLink>} /> :
      <div className="ui-columns">
        <Panel title="Choose a pack" description="Export your map from the editor, then import the complete .notsumap file here. Online packs can be up to 16 MB.">
          <div className="ui-cluster">
            <label className={buttonClass({}, "pack-import")}><span className="ui-button__content"><Icon name="plus" />Import pack</span><input type="file" accept=".notsumap" aria-label="Import pack to publish" disabled={busy} onChange={event=>{ const file=event.target.files?.[0]; event.target.value=""; if (file) { setRights(false); void library.importFile(file); } }}/></label>
          </div>
          <Field label="Your local library"><select disabled={busy} value={selected && library.maps.some(row=>row.revision===selected.revision) ? selected.revision : ""} onChange={event=>void library.open(event.target.value)}><option value="" disabled>Choose a pack</option>{library.maps.map(map=><option key={map.revision} value={map.revision}>{map.title} · {map.revision.slice(0,8)}</option>)}</select></Field>
          {selected && <div className="publish-pack-info">
            <Badge>Selected revision</Badge>
            <h3>{selected.set.title}</h3>
            <p className="ui-text-muted ui-text-small">{selected.set.artist} · mapped by {selected.set.author}</p>
            <ul>{selected.set.difficulties.map(d=><li key={d.chart.id}>{d.name}<span>{d.chart.notes.length} circles</span></li>)}</ul>
            <p className="ui-text-muted ui-text-small">{(selected.bytes.length/1024/1024).toFixed(1)} MB · {selected.revision.slice(0,12)}</p>
          </div>}
          {selected && !valid && <Notice tone="warning">Packs need at least one circle in every difficulty and must be at most 16 MB.</Notice>}
          {!profile && <Notice tone="warning" actions={<ButtonLink size="sm" to="/account">Open account</ButtonLink>}>Create your public profile before publishing.</Notice>}
          <Checkbox label="I have permission to distribute this map, its recording, and all included media." checked={rights} disabled={busy || !valid || !profile} onChange={event=>setRights(event.target.checked)} />
          <p className="ui-text-muted ui-text-small">Published as <strong>{profile?.username ?? "your public profile"}</strong>. This shares the entire pack publicly as an unranked community map.</p>
          <div><Button variant="primary" size="lg" icon={<Icon name="upload" />} disabled={busy || !valid || !rights || !profile} onClick={()=>{ if (selected) void publications.publish(selected.revision,selected.bytes); }}>{publications.busy ? "Working…" : "Publish this revision"}</Button></div>
          {library.error && <Notice tone="danger" role="alert">{library.error}</Notice>}{library.notice && <Notice tone="success" role="status">{library.notice}</Notice>}
        </Panel>
        <Panel title="Your publications" actions={<IconButton size="sm" label="Refresh publications" icon={<Icon name="refresh" />} disabled={busy} onClick={publications.refresh} />}>
          {publications.error && <Notice tone="danger" role="alert">{publications.error}</Notice>}{publications.notice && <Notice tone="success" role="status">{publications.notice}</Notice>}
          {publications.busy && <Loading>Updating publications…</Loading>}
          {publications.loaded && !publications.items.length && <p className="ui-text-muted ui-text-small">Your first published revision will appear here.</p>}
          {publications.items.length > 0 && <List label="Your publications">{publications.items.map(map=><ListItem key={map.revision} className="published-row"
            title={map.title} subtitle={`${map.artist} · ${map.difficulties.length} difficulties`}
            meta={<><Badge tone={map.moderated ? "danger" : map.visible ? "success" : "neutral"}>{map.moderated ? "Hidden by moderation" : map.visible ? "Public · unranked" : "Withdrawn"}</Badge><span className="ui-text-muted ui-text-small">{map.revision.slice(0,12)} · {new Date(map.publishedAt).toLocaleDateString()}</span></>}
            actions={<Button size="sm" variant={map.visible ? "ghost" : "secondary"} disabled={busy || map.moderated} onClick={()=>void publications.visibility(map)}>{map.visible ? "Withdraw" : "Restore"}</Button>} />)}
          </List>}
        </Panel>
      </div>}
  </Page></AppScreen>;
}
