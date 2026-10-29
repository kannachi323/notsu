import { onlineAvailable } from "../../accounts/data/availability";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { AppScreen } from "../../home/components/AppScreen";
import { Badge, Button, ButtonLink, FooterButton, Icon, Loading, MAIN_CONTENT_ID, Notice, ScreenFooter, TabLinks, Tabs, buttonClass } from "../../../shared/components";
import { RhythmScreen } from "../../rhythm/RhythmScreen";
import { DEFAULT_MODS } from "../../rhythm/domain/rules";
import { useMapLibrary } from "../useMapLibrary";
import { starterMaps } from "../data/starters";
import { MapDetails } from "./MapDetails";
import { MapPreview } from "./MapPreview";
import { mapHue } from "./presentation";
import { mapCollection } from "../domain/collection";
import type { MapSort } from "../domain/collection";
import { MapCollection } from "./MapCollection";
import { PlayModifiers } from "./PlayModifiers";
import { OnlineCatalog } from "./OnlineCatalog";

export function MapBrowser({ view = "select" }: { view?: "select" | "browse" }) {
  const [params,setParams] = useSearchParams(), navigate = useNavigate();
  const library = useMapLibrary(params.get("map") ?? undefined), { selected,busy } = library;
  const [query,setQuery] = useState(""), [favorites,setFavorites] = useState(false), [sort,setSort] = useState<MapSort>("recent");
  const [mods,setMods] = useState({ ...DEFAULT_MODS }), search = useRef<HTMLInputElement>(null);
  const previousRandom = useRef<string | undefined>(undefined);
  const online = onlineAvailable && view === "browse" && params.get("source") === "online";
  const cards = mapCollection(library.maps,query,favorites,sort);
  const difficulty = selected?.set.difficulties.find(item=>item.chart.id===library.difficultyId);
  const open = (revision:string) => { if (!busy) { const next = new URLSearchParams(params); next.set("map",revision); setParams(next,{ replace:true }); void library.open(revision); } };
  const random = (restore = false) => {
    if (restore && previousRandom.current) { const revision = previousRandom.current; previousRandom.current=selected?.revision; open(revision); return; }
    const alternatives = cards.map(rows=>rows[0]).filter(row=>row.setId !== selected?.set.id);
    if (alternatives.length) { previousRandom.current=selected?.revision; open(alternatives[Math.floor(Math.random()*alternatives.length)].revision); }
  };
  useEffect(() => {
    if (library.playing) return;
    const shortcuts = (event:KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey || document.querySelector("dialog[open]") ||
        (event.target instanceof HTMLElement && event.target.closest("input, textarea, select, button, a, [contenteditable]"))) return;
      if (event.key === "Escape") { event.preventDefault(); navigate("/"); }
      else if (view === "select" && event.key === "Enter" && !busy && difficulty?.chart.notes.length) { event.preventDefault(); void library.play(undefined,mods); }
      else if (view === "select" && event.key === "F2" && !busy) { event.preventDefault(); random(event.shiftKey); }
      else if (event.key === "/" && !online) { event.preventDefault(); search.current?.focus(); }
    };
    window.addEventListener("keydown",shortcuts); return () => window.removeEventListener("keydown",shortcuts);
  });
  if (library.playing) return <RhythmScreen local={{ ...library.playing,close:library.closePlay }}/>;
  return <AppScreen footer={false} className={`song-shell ${view === "browse" ? "browse-shell" : "select-shell"}`}>
    <div className={`song-backdrop artwork-${mapHue(selected?.set.id ?? "orbit-signal")}`} aria-hidden="true"/>
    <main className="song-main" id={MAIN_CONTENT_ID} tabIndex={-1}>
      <header className="song-heading">
        <div><p>{view === "browse" ? "Discover your next song" : "Rhythm · Solo"}</p><h1>{view === "browse" ? "Browse maps" : "Song selection"}</h1></div>
        <div className="ui-cluster">
          {view === "browse"
            ? <ButtonLink variant="ghost" size="sm" to={`/rhythm${selected ? `?map=${selected.revision}` : ""}`} icon={<Icon name="play" />}>Song selection</ButtonLink>
            : <ButtonLink variant="ghost" size="sm" to={onlineAvailable ? "/browse?source=online" : "/browse"} icon={<Icon name="browse" />}>{onlineAvailable ? "Get more maps" : "Browse"}</ButtonLink>}
          {onlineAvailable && <ButtonLink variant="ghost" size="sm" to="/publish" icon={<Icon name="upload" />}>Publish</ButtonLink>}
          <label className={buttonClass({ size: "sm" }, "pack-import")}><span className="ui-button__content"><Icon name="plus" />Import pack</span><input aria-label="Import map package" type="file" accept=".notsumap" disabled={busy} onChange={event=>{ const file=event.target.files?.[0]; event.target.value=""; if (file) void library.importFile(file); }}/></label>
        </div>
      </header>
      <div className="song-notices" aria-live="polite">
        {busy && <Loading>Preparing map…</Loading>}
        {library.error && <Notice tone="danger" role="alert" actions={<Button size="sm" disabled={busy} onClick={()=>void library.open(params.get("map") ?? selected?.revision ?? starterMaps[0].revision)}>Retry</Button>}>{library.error}</Notice>}
        {library.notice && <Notice tone="success">{library.notice}</Notice>}
        {library.removed && <Notice actions={<Button size="sm" disabled={busy} onClick={()=>void library.undo()}>Undo removal</Button>}>Removed {library.removed.title}.</Notice>}
      </div>
      {view === "browse" && onlineAvailable && <TabLinks className="browse-sources" label="Map source" items={[{ to: "/browse", label: "On this device", current: !online }, { to: "/browse?source=online", label: "Online discovery", current: online }]} />}
      <div className="song-content">
        {view === "select" && <aside className="song-information" aria-label="Selected map"><MapDetails library={library}/></aside>}
        {online ? <OnlineCatalog library={library}/> : <section className="song-collection" aria-label="Map collection">
          <div className="song-filters">
            <label className="song-search"><Icon name="search" /><input ref={search} aria-label="Search maps" type="search" placeholder="Search songs, artists, mappers…" value={query} onChange={event=>setQuery(event.target.value)}/><Badge tone="accent">{cards.length}</Badge></label>
            <div className="song-filter-row">
              <Tabs variant="segmented" label="Filter maps" items={[{ value: "all", label: "All maps" }, { value: "favorites", label: "Favorites" }]} value={favorites ? "favorites" : "all"} onChange={value => setFavorites(value === "favorites")} />
              <label className="song-sort">Sort<select aria-label="Sort maps" value={sort} onChange={event=>setSort(event.target.value as MapSort)}><option value="recent">Date added</option><option value="title">Title</option><option value="artist">Artist</option><option value="length">Length</option></select></label>
            </div>
          </div>
          {view === "browse" && <p className="pack-explainer">Included and imported packs, ready to play.</p>}
          <MapCollection library={library} cards={cards} view={view} open={open} play={()=>{ if (difficulty?.chart.notes.length) void library.play(undefined,mods); }} clear={()=>{ setQuery(""); setFavorites(false); }}/>
        </section>}
      </div>
    </main>
    <ScreenFooter back={{ to: "/" }}>
      {view === "select" ? <>
        <PlayModifiers mods={mods} change={setMods} busy={busy}/>
        <FooterButton tone="violet" icon={<Icon name="shuffle" />} label="Random" shortcut="F2" disabled={busy || cards.length<2} onClick={event=>random(event.shiftKey)} />
        {selected && <MapPreview key={selected.revision} selected={selected}/>}
        <div className="song-play-summary"><strong>{difficulty?.name ?? "Select a map"}</strong><span>{mods.noFail || mods.autoplay ? "Practice · unranked" : "Local scores · unranked"}</span></div>
        <button className="song-play-button" disabled={busy || !difficulty?.chart.notes.length} onClick={()=>void library.play(undefined,mods)}><span className="song-play-orb" aria-hidden="true"><Icon name="start" /></span><span>{mods.autoplay ? "Watch" : "Play"}<small>Enter</small></span></button>
      </> : <>
        <p className="browse-footer-note">Music and difficulties in every pack.</p>
        <ButtonLink className="browse-create-link" variant="primary" sheared to="/editor" icon={<Icon name="editor" />}>Create a map</ButtonLink>
      </>}
    </ScreenFooter>
  </AppScreen>;
}
