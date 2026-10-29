import { useEffect, useRef, useState } from "react";
import { configuration, configurationIssue } from "../../accounts/data/auth";
import { downloadOnlineMap, listOnlineMaps } from "../data/online";
import type { MapCursor, PublishedMap } from "../domain/published";
import type { useMapLibrary } from "../useMapLibrary";
import { mapDuration, mapHue } from "./presentation";
import { Badge, Button, ButtonLink, EmptyState, Icon, Loading, Notice } from "../../../shared/components";

export function OnlineCatalog({ library }: { library:ReturnType<typeof useMapLibrary> }) {
  const [query,setQuery] = useState(""), [search,setSearch] = useState(""), [refresh,setRefresh] = useState(0);
  const [items,setItems] = useState<PublishedMap[]>([]), [next,setNext] = useState<MapCursor|null>(null);
  const [loading,setLoading] = useState(false), [downloading,setDownloading] = useState(""), [error,setError] = useState("");
  const [notice,setNotice] = useState(""), [hasLoaded,setHasLoaded] = useState(false);
  const generation = useRef(0), download = useRef<AbortController | null>(null), paging = useRef(false);
  const pageAbort = useRef<AbortController | null>(null);
  useEffect(() => {
    if (!configuration) return;
    const token = ++generation.current, controller = new AbortController();
    pageAbort.current?.abort(); pageAbort.current=controller; paging.current=false;
    setLoading(true); setError(""); setItems([]); setNext(null); setHasLoaded(false);
    void listOnlineMaps(search,null,controller.signal).then(page => {
      if (token === generation.current) { setItems(page.items); setNext(page.next); setHasLoaded(true); }
    }).catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Maps could not load."); })
      .finally(() => { if (token === generation.current) setLoading(false); });
    return () => { generation.current++; controller.abort(); pageAbort.current?.abort(); };
  },[search,refresh]);
  useEffect(() => () => download.current?.abort(),[]);
  async function more() {
    if (!next || loading || paging.current) return;
    const token = generation.current, controller = new AbortController(); pageAbort.current=controller; paging.current=true; setLoading(true); setError("");
    try { const page = await listOnlineMaps(search,next,controller.signal);
      if (token !== generation.current) return;
      setItems(previous => [...previous,...page.items.filter(row => !previous.some(item => item.revision === row.revision))]); setNext(page.next);
    } catch(cause) { if (!controller.signal.aborted && token===generation.current) setError(cause instanceof Error ? cause.message : "Maps could not load."); }
    finally { if (token===generation.current) { paging.current=false; setLoading(false); } }
  }
  async function install(map:PublishedMap) {
    if (download.current || library.busy) return;
    const controller = new AbortController(); download.current=controller; setDownloading(map.revision); setError(""); setNotice("");
    try { const pack = await downloadOnlineMap(map,controller.signal);
      if (controller.signal.aborted) return;
      if (await library.importBytes(pack.bytes) && !controller.signal.aborted) setNotice(`${map.title} is ready. Open Song selection to play.`);
    } catch(cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Download failed. Retry shortly."); }
    finally { download.current=null; if (!controller.signal.aborted) setDownloading(""); }
  }
  if (!configuration) return <EmptyState title="Discovery is coming online" description={configurationIssue || "Online services are not configured in this build. You can play the included music, import packs, and create maps locally."}
    action={<ButtonLink variant="primary" to="/rhythm" icon={<Icon name="play" />}>Play included songs</ButtonLink>} />;
  return <section className="online-catalog" aria-label="Online map catalog">
    <form className="online-search" onSubmit={event => { event.preventDefault(); if (search === query.trim()) setRefresh(value=>value+1); else setSearch(query.trim()); }}>
      <label className="song-search"><Icon name="search" /><input aria-label="Search online maps" type="search" maxLength={80} placeholder="Search published songs, artists, mappers…" value={query} onChange={event=>setQuery(event.target.value)}/></label>
      <Button variant="primary" type="submit">Search</Button>
    </form>
    <p className="pack-explainer">Published community packs · music and difficulties included · unranked</p>
    {error && <Notice tone="danger" role="alert" actions={<Button size="sm" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>Refresh</Button>}>{error}</Notice>}
    {notice && <Notice tone="success" role="status" actions={<ButtonLink size="sm" to={`/rhythm?map=${library.selected?.revision ?? ""}`}>Song selection</ButtonLink>}>{notice}</Notice>}
    <div className="browse-grid">{items.map(map => { const installed = library.maps.some(row=>row.revision===map.revision); return <article className={`song-entry artwork-${mapHue(map.setId)}`} key={map.revision}>
      <div className="song-card online-map-card"><span className="song-card-image" aria-hidden="true"/><div className="song-card-copy"><strong>{map.title}</strong><span>{map.artist}</span><small>mapped by {map.author} · published by {map.publisher}</small><span className="song-card-tags"><Badge tone="violet">Community</Badge><span>{map.difficulties.length} difficulties</span><span>{mapDuration(Math.max(...map.difficulties.map(d=>d.durationMs)))}</span></span></div></div>
      <div className="browse-card-footer"><span>{(map.bytes/1024/1024).toFixed(1)} MB</span>{installed ? <ButtonLink size="sm" variant="primary" to={`/rhythm?map=${map.revision}`} icon={<Icon name="play" />}>Play</ButtonLink> : <Button size="sm" variant="primary" icon={<Icon name="download" />} disabled={!!downloading || library.busy} onClick={()=>void install(map)}>{downloading===map.revision ? "Downloading…" : "Download"}</Button>}</div>
    </article>; })}</div>
    {loading && <Loading>Loading maps…</Loading>}
    {hasLoaded && !items.length && !error && <EmptyState title={search ? "No matching maps" : "No maps published yet"} description={search ? "Try a different title, artist or mapper." : "Be the first to share a complete map pack."}
      action={<ButtonLink variant="primary" to="/publish" icon={<Icon name="upload" />}>Publish a map</ButtonLink>} />}
    {next && <div className="online-more"><Button disabled={loading} onClick={()=>void more()}>Load more maps</Button></div>}
  </section>;
}
