import type { useMapLibrary } from "../useMapLibrary";
import { starterFile } from "../data/starters";
import { MapExport } from "./MapExport";
import { RecordPanel } from "../../records/components/RecordPanel";
import { mapDuration } from "./presentation";

export function MapDetails({ library }: { library: ReturnType<typeof useMapLibrary> }) {
  const { selected, busy, difficultyId } = library;
  const [difficulty] = selected?.set.difficulties.filter(item => item.chart.id === difficultyId) ?? [];
  if (!selected || !difficulty) return <div className="song-information-empty"><span aria-hidden="true">◎</span><h2>Choose your rhythm</h2><p>Pick a song on the right. Its music is already in the pack.</p></div>;
  const row = library.maps.find(map => map.revision === selected.revision), revisions = library.maps.filter(map => map.setId === selected.set.id);
  const tempos = difficulty.chart.timing.map(point => point.bpm), minBpm = Math.min(...tempos), maxBpm = Math.max(...tempos);
  return <>
    <div className="selected-song-hero"><span className="song-status">{starterFile(selected.revision) ? "Included with notsu" : "Local map"}</span><h2>{selected.set.title}</h2><p className="selected-artist">{selected.set.artist}</p><p className="selected-mapper">mapped by <strong>{selected.set.author}</strong></p>
      <dl className="selected-song-stats"><div><dt>Length</dt><dd>{mapDuration(difficulty.chart.durationMs)}</dd></div><div><dt>BPM</dt><dd>{minBpm}{minBpm !== maxBpm ? `–${maxBpm}` : ""}</dd></div><div><dt>Circles</dt><dd>{difficulty.chart.notes.length}</dd></div><div><dt>Lines</dt><dd>{difficulty.chart.lanes.length}</dd></div></dl>
    </div>
    <div className="selected-difficulty"><span aria-hidden="true">◈</span><div><h3>{difficulty.name}</h3><p>Mapped by {difficulty.author} · {difficulty.chart.notes.filter(n => n.kind === "hold").length} holds</p></div></div>
    <div className="song-detail-tools">{row && <button disabled={busy} aria-pressed={row.favorite} onClick={() => void library.favorite(row)}>{row.favorite ? "★ Favorited" : "☆ Favorite"}</button>}<MapExport bytes={selected.bytes} title={selected.set.title}/></div>
    <RecordPanel key={`${selected.revision}:${difficultyId}`} revision={selected.revision} chartId={difficultyId} busy={busy} watch={id => void library.play(id)}/>
    <details className="song-package-details"><summary>Map details & revisions</summary><p>Song and all difficulties included · {(selected.bytes.length / 1024 / 1024).toFixed(1)} MB</p>
      {revisions.length > 1 && <label>Revision<select aria-label="Map revision" disabled={busy} value={selected.revision} onChange={event => void library.open(event.target.value)}>{revisions.map(row => <option key={row.revision} value={row.revision}>{row.importedAt ? new Date(row.importedAt).toLocaleString() : "Included version"} · {row.revision.slice(0, 8)}</option>)}</select></label>}
      <p>Revision {selected.revision.slice(0, 12)}. Local scores are kept separately for each revision.</p>{selected.saved && !starterFile(selected.revision) && <button disabled={busy} onClick={() => void library.remove()}>Remove this revision</button>}
    </details>
  </>;
}
