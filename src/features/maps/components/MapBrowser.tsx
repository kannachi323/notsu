import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { HomeHeader } from "../../home/components/HomeHeader";
import { RhythmScreen } from "../../rhythm/RhythmScreen";
import { DEFAULT_MODS } from "../../rhythm/domain/rules";
import { useMapLibrary } from "../useMapLibrary";
import { starterFile, starterMaps } from "../data/starters";
import { MapDetails } from "./MapDetails";
import { MapPreview } from "./MapPreview";
import type { MapSummary } from "../data/storage";
import { mapDuration, mapHue } from "./presentation";

export function MapBrowser({ view = "select" }: { view?: "select" | "browse" }) {
  const [params, setParams] = useSearchParams();
  const library = useMapLibrary(params.get("map") ?? undefined), { selected, busy } = library;
  const [query, setQuery] = useState(""), [favorites, setFavorites] = useState(false), [sort, setSort] = useState("recent");
  const [mods, setMods] = useState({ ...DEFAULT_MODS });
  const groups = new Map<string, MapSummary[]>();
  for (const row of library.maps) {
    const text = [row.title, row.artist, row.author, ...row.difficulties.flatMap(d => [d.name, d.author])].join(" ").toLowerCase();
    if ((favorites && !row.favorite) || !query.toLowerCase().trim().split(/\s+/).every(word => text.includes(word))) continue;
    groups.set(row.setId, [...(groups.get(row.setId) ?? []), row]);
  }
  const cards = [...groups.values()].sort((a, b) => sort === "title" ? a[0].title.localeCompare(b[0].title) : sort === "artist" ? a[0].artist.localeCompare(b[0].artist) : b[0].importedAt - a[0].importedAt);
  const difficulty = selected?.set.difficulties.find(item => item.chart.id === library.difficultyId);
  const open = (revision: string) => { if (!busy) { setParams({ map: revision }, { replace: true }); void library.open(revision); } };
  const random = () => { const alternatives = cards.map(rows => rows[0]).filter(row => row.setId !== selected?.set.id); if (alternatives.length) open(alternatives[Math.floor(Math.random() * alternatives.length)].revision); };
  if (library.playing) return <RhythmScreen local={{ ...library.playing, close: library.closePlay }} />;
  return <div className={`notsu-home song-shell ${view === "browse" ? "browse-shell" : "select-shell"}`}>
    <div className={`song-backdrop artwork-${mapHue(selected?.set.id ?? "orbit-signal")}`} aria-hidden="true"/><HomeHeader />
    <main className="song-main">
      <header className="song-heading"><div><p>{view === "browse" ? "Your next favorite" : "Solo play"}</p><h1>{view === "browse" ? "Browse maps" : "Song selection"}</h1></div>
        <div className="song-heading-actions"><Link to={view === "browse" ? `/rhythm${selected ? `?map=${selected.revision}` : ""}` : "/browse"}>{view === "browse" ? "Song selection →" : "Browse maps ↗"}</Link>
        <label className="pack-import">＋ Import pack<input aria-label="Import map package" type="file" accept=".notsumap" disabled={busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void library.importFile(file); }}/></label></div>
      </header>
      <div className="song-notices" aria-live="polite">{busy && <p role="status">Preparing map…</p>}{library.error && <p className="map-error" role="alert">{library.error} <button disabled={busy} onClick={() => void library.open(params.get("map") ?? selected?.revision ?? starterMaps[0].revision)}>Retry</button></p>}{library.notice && <p>{library.notice}</p>}
        {library.removed && <p>Removed {library.removed.title}. <button disabled={busy} onClick={() => void library.undo()}>Undo removal</button></p>}</div>
      <div className="song-content">
        {view === "select" && <aside className="song-information" aria-label="Selected map"><MapDetails library={library}/></aside>}
        <section className="song-collection" aria-label="Map collection">
          <div className="song-filters"><label className="song-search"><span aria-hidden="true">⌕</span><input aria-label="Search maps" type="search" placeholder="Search songs, artists, mappers…" value={query} onChange={event => setQuery(event.target.value)}/><span className="song-match-count">{cards.length}</span></label>
            <div className="song-filter-row"><button aria-pressed={!favorites} onClick={() => setFavorites(false)}>All maps</button><button aria-pressed={favorites} onClick={() => setFavorites(true)}>Favorites</button><label>Sort <select aria-label="Sort maps" value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Date added</option><option value="title">Title</option><option value="artist">Artist</option></select></label></div>
          </div>
          {view === "browse" && <p className="pack-explainer">Every pack includes the music and its difficulties. Import once, then play.</p>}
          <div className={view === "browse" ? "browse-grid" : "song-carousel"} onKeyDown={event => {
            if (busy || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || !(event.target instanceof HTMLElement) || !event.target.matches("button[data-map]")) return;
            const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-map]")], index = buttons.indexOf(event.target as HTMLButtonElement);
            const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
            event.preventDefault(); buttons[next]?.focus(); buttons[next]?.click();
          }}>
            {cards.map(entries => { const card = entries[0], active = selected?.set.id === card.setId; return <article key={card.setId} className={`song-entry ${active ? "is-selected" : ""} artwork-${mapHue(card.setId)}`}>
              <button data-map={card.revision} className="song-card" aria-pressed={active} disabled={busy} onClick={() => open(card.revision)}>
                <span className="song-card-image" aria-hidden="true"/><span className="song-card-copy"><strong>{card.title}</strong><span>{card.artist}</span><small>mapped by {card.author}</small><span className="song-card-tags"><span>{starterFile(card.revision) ? "Included" : "Local"}</span><span>{mapDuration(Math.max(...card.difficulties.map(d => d.durationMs)))}</span><span>{card.difficulties.length} difficulties</span>{card.favorite && <span>★</span>}</span></span><span className="song-card-arrow" aria-hidden="true">{active ? "◉" : "›"}</span>
              </button>
              {active && view === "select" && <fieldset className="song-difficulties" disabled={busy}><legend className="visually-hidden">Choose a difficulty</legend>{selected.set.difficulties.map((item, index) => <label key={item.chart.id} className={library.difficultyId === item.chart.id ? "chosen" : ""}><input type="radio" name="difficulty" checked={library.difficultyId === item.chart.id} onChange={() => library.setDifficultyId(item.chart.id)}/><span className="difficulty-symbol" aria-hidden="true">{index ? "◇" : "◈"}</span><span><strong>{item.name}</strong><small>{item.chart.notes.length} circles · {item.chart.lanes.length} lines{!item.chart.notes.length ? " · Draft" : ""}</small></span><span className="difficulty-mapper">{item.author}</span></label>)}</fieldset>}
              {view === "browse" && <Link className="browse-play-link" to={`/rhythm?map=${card.revision}`}>Choose difficulty <span aria-hidden="true">→</span></Link>}
            </article>; })}
            {!cards.length && <div className="song-empty"><h2>No matching maps</h2><p>Try a different search or clear your favorites filter.</p><button onClick={() => { setQuery(""); setFavorites(false); }}>Show all maps</button></div>}
          </div>
        </section>
      </div>
    </main>
    <footer className="song-action-bar"><Link className="song-back" to="/">← <span>Back</span></Link>
      {view === "select" ? <><div className="song-mods"><label><input type="checkbox" disabled={busy} checked={mods.noFail} onChange={event => setMods({ ...mods, noFail: event.target.checked })}/>No Fail</label><label><input type="checkbox" disabled={busy} checked={mods.autoplay} onChange={event => setMods({ ...mods, autoplay: event.target.checked })}/>Autoplay</label></div><button className="song-random" disabled={busy || cards.length < 2} onClick={random}>⇄ <span>Random</span></button>
        {selected && <MapPreview key={selected.revision} selected={selected}/>}
        <div className="song-play-summary"><strong>{difficulty?.name ?? "Select a map"}</strong><span>{mods.noFail || mods.autoplay ? "Practice · unranked" : "Local scores · unranked"}</span></div><button className="song-play-button" disabled={busy || !difficulty?.chart.notes.length} onClick={() => void library.play(undefined, mods)}>{mods.autoplay ? "Watch" : "Play"}<span aria-hidden="true">▷</span></button></> : <><p className="browse-footer-note">Music and difficulties in every pack.</p><Link className="song-create-link" to="/editor">Create a map →</Link></>}
    </footer>
  </div>;
}
