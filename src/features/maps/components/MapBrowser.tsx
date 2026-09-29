import { useState } from "react";
import { Link } from "react-router";
import { HomeHeader } from "../../home/components/HomeHeader";
import { RhythmScreen } from "../../rhythm/RhythmScreen";
import { useMapLibrary } from "../useMapLibrary";
import { MapExport } from "./MapExport";
import { RecordPanel } from "../../records/components/RecordPanel";
import type { MapSummary } from "../data/storage";

const duration = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
export function MapBrowser() {
  const library = useMapLibrary(), { selected, busy } = library;
  const [query, setQuery] = useState(""), [favorites, setFavorites] = useState(false), [sort, setSort] = useState("recent");
  const groups = new Map<string, MapSummary[]>();
  for (const row of library.maps) {
    const text = [row.title, row.artist, row.author, ...row.difficulties.flatMap(d => [d.name, d.author])].join(" ").toLowerCase();
    if ((favorites && !row.favorite) || !text.includes(query.trim().toLowerCase())) continue;
    groups.set(row.setId, [...(groups.get(row.setId) ?? []), row]);
  }
  const cards = [...groups.values()].sort((a, b) => sort === "title" ? a[0].title.localeCompare(b[0].title) : b[0].importedAt - a[0].importedAt);
  const row = library.maps.find(map => map.revision === selected?.revision);
  const revisions = library.maps.filter(map => map.setId === selected?.set.id);
  const difficulty = selected?.set.difficulties.find(item => item.chart.id === library.difficultyId);
  if (library.playing) return <RhythmScreen local={{ ...library.playing, close: library.closePlay }} />;
  return <div className="notsu-home map-browser"><HomeHeader /><main className="map-main">
    <header className="map-heading"><div><p className="map-eyebrow">Your collection</p><h1>Find your next rhythm.</h1><p>Import a map package and play its song, circles and moving lines.</p></div>
      <label className="map-import">Import map<input aria-label="Import map package" type="file" accept=".notsumap" disabled={busy} onChange={event => {
        const file = event.target.files?.[0]; event.target.value = ""; if (file) void library.importFile(file);
      }} /><span>.notsumap · up to 128 MB</span></label></header>
    <div className="map-search"><label><span className="visually-hidden">Search local maps</span><input type="search" placeholder="Search songs, artists, mappers…" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label className="map-favorite-filter"><input type="checkbox" checked={favorites} onChange={event => setFavorites(event.target.checked)} /> Favorites</label>
      <label className="map-sort"><span className="visually-hidden">Sort maps</span><select value={sort} onChange={event => setSort(event.target.value)}><option value="recent">Recently imported</option><option value="title">Song title</option></select></label>
    </div>
    {busy && <p className="map-notice" role="status">Preparing map…</p>}{library.error && <p className="map-error" role="alert">{library.error}</p>}
    {library.notice && <p className="map-notice" role="status">{library.notice}</p>}
    {library.removed && <div className="map-notice"><span>Removed {library.removed.title} from this device.</span><button disabled={busy} onClick={() => void library.undo()}>Undo removal</button></div>}
    <div className="map-columns"><section className="map-list" aria-label="Local map collection"><div className="map-list-heading"><h2>On this device</h2><span>{cards.length} {cards.length === 1 ? "map" : "maps"}</span></div>
      {cards.map(entries => { const card = entries[0]; return <button key={card.setId} className={`map-card ${selected?.set.id === card.setId ? "selected" : ""}`} disabled={busy} aria-pressed={selected?.set.id === card.setId} onClick={() => void library.open(card.revision)}>
        <span className="map-card-art" aria-hidden="true"><i /><i /><i /></span><span className="map-card-copy"><strong>{card.title}</strong><span>{card.artist} · mapped by {card.author}</span><small>{card.difficulties.length} {card.difficulties.length === 1 ? "difficulty" : "difficulties"} · {duration(Math.max(...card.difficulties.map(d => d.durationMs)))}{entries.length > 1 ? ` · ${entries.length} revisions` : ""}</small></span>{card.favorite && <span aria-label="Favorite">★</span>}
      </button>; })}
      {!cards.length && <div className="map-empty"><span className="map-empty-orbit" aria-hidden="true" /><h3>{library.maps.length ? "No matching maps" : "A collection of your own"}</h3>
        <p>{library.maps.length ? "Try another search or clear the Favorites filter." : "Import a .notsumap file, or create a map from a song in the editor."}</p><Link to="/editor">Open editor →</Link></div>}
    </section><aside className="map-detail" aria-label="Selected map">
      {selected && difficulty ? <><p className="map-eyebrow">{selected.saved ? "Local map" : "Session only"} · Unranked</p><h2>{selected.set.title}</h2><p>{selected.set.artist}</p><p className="map-mapper">Mapped by {selected.set.author}</p>
        {revisions.length > 1 && <label>Revision<select aria-label="Map revision" value={selected.revision} disabled={busy} onChange={event => void library.open(event.target.value)}>{revisions.map(revision => <option key={revision.revision} value={revision.revision}>{new Date(revision.importedAt).toLocaleString()} · {revision.revision.slice(0, 8)}</option>)}</select></label>}
        <fieldset disabled={busy} className="map-difficulties"><legend>Choose a difficulty</legend>{selected.set.difficulties.map(item => <label key={item.chart.id}><input type="radio" name="difficulty" checked={library.difficultyId === item.chart.id} onChange={() => library.setDifficultyId(item.chart.id)} /><span><strong>{item.name}</strong><small>{item.chart.notes.length} circles · {item.chart.lanes.length} lines{item.author !== selected.set.author ? ` · ${item.author}` : ""}{!item.chart.notes.length ? " · Draft" : ""}</small></span></label>)}</fieldset>
        <dl className="map-stats"><div><dt>Length</dt><dd>{duration(difficulty.chart.durationMs)}</dd></div><div><dt>Tempo</dt><dd>{Math.min(...difficulty.chart.timing.map(p => p.bpm))}{new Set(difficulty.chart.timing.map(p => p.bpm)).size > 1 ? `–${Math.max(...difficulty.chart.timing.map(p => p.bpm))}` : ""} <small>BPM</small></dd></div></dl>
        <button className="map-play" disabled={busy || !difficulty.chart.notes.length} onClick={() => void library.play()}>Play {difficulty.name} <span aria-hidden="true">→</span></button>
        {!difficulty.chart.notes.length && <p className="map-hint">This draft has no circles yet.</p>}
        <div className="map-secondary">{row && <button disabled={busy} aria-pressed={row.favorite} onClick={() => void library.favorite(row)}>{row.favorite ? "★ Favorited" : "☆ Favorite"}</button>}<MapExport bytes={selected.bytes} title={selected.set.title} /></div>
        <details className="map-file-details"><summary>Package details</summary><p>Revision {selected.revision.slice(0, 12)} · {(selected.bytes.length / 1024 / 1024).toFixed(1)} MB</p><p>Importing changed content keeps earlier revisions. Scores from different revisions must remain separate.</p>
          {selected.saved && <button disabled={busy} onClick={() => void library.remove()}>Remove this revision</button>}</details>
        <RecordPanel key={`${selected.revision}:${difficulty.chart.id}`} revision={selected.revision} chartId={difficulty.chart.id} busy={busy} watch={id => void library.play(id)} />
      </> : <div className="map-detail-empty"><span aria-hidden="true">↖</span><h2>Choose a map</h2><p>Pick a song to see its difficulties and start playing.</p></div>}
    </aside></div>
  </main><footer className="notsu-footer"><span>Local collection · Offline play</span><span>Unofficial community project · Not affiliated with ppy</span></footer></div>;
}
