import { onlineAvailable } from "../../accounts/data/availability";
import { Badge, Button, ButtonLink, EmptyState, Field, Icon, StatList } from "../../../shared/components";
import type { useMapLibrary } from "../useMapLibrary";
import { starterFile } from "../data/starters";
import { MapExport } from "./MapExport";
import { RecordPanel } from "../../records/components/RecordPanel";
import { mapDuration } from "./presentation";
import { CoverArt } from "../../../shared/components";

export function MapDetails({ library }: { library: ReturnType<typeof useMapLibrary> }) {
  const { selected, busy, difficultyId } = library;
  const [difficulty] = selected?.set.difficulties.filter(item => item.chart.id === difficultyId) ?? [];
  if (!selected || !difficulty) return <EmptyState title="Choose your rhythm" description="Pick a song on the right. Its music is already in the pack." />;
  const row = library.maps.find(map => map.revision === selected.revision), revisions = library.maps.filter(map => map.setId === selected.set.id);
  const tempos = difficulty.chart.timing.map(point => point.bpm), minBpm = Math.min(...tempos), maxBpm = Math.max(...tempos);
  return <>
    <div className="selected-song-hero">
      <CoverArt seed={selected.set.id} className="selected-song-art" />
      <Badge tone={starterFile(selected.revision) ? "accent" : "violet"}>{starterFile(selected.revision) ? "Included with notsu" : "Local map"}</Badge>
      <h2>{selected.set.title}</h2><p className="selected-artist">{selected.set.artist}</p><p className="selected-mapper">mapped by <strong>{selected.set.author}</strong></p>
      <StatList className="selected-song-stats" items={[
        { label: "Length", value: mapDuration(difficulty.chart.durationMs) },
        { label: "BPM", value: `${minBpm}${minBpm !== maxBpm ? `–${maxBpm}` : ""}` },
        { label: "Circles", value: difficulty.chart.notes.length },
        { label: "Lines", value: difficulty.chart.lanes.length },
      ]} />
    </div>
    <div className="selected-difficulty"><span aria-hidden="true">◈</span><div><h3>{difficulty.name}</h3><p>Mapped by {difficulty.author} · {difficulty.chart.notes.filter(n => n.kind === "hold").length} holds</p></div></div>
    <div className="song-detail-tools">
      {row && <Button size="sm" icon={<Icon name="star" />} disabled={busy} aria-pressed={row.favorite} onClick={() => void library.favorite(row)}>{row.favorite ? "Favorited" : "Favorite"}</Button>}
      <MapExport bytes={selected.bytes} title={selected.set.title}/>
      {onlineAvailable && <ButtonLink size="sm" variant="ghost" icon={<Icon name="upload" />} to={`/publish?map=${selected.revision}`}>Publish</ButtonLink>}
    </div>
    <RecordPanel key={`${selected.revision}:${difficultyId}`} revision={selected.revision} chartId={difficultyId} busy={busy} watch={id => void library.play(id)}/>
    <details className="song-package-details"><summary>Map details & revisions</summary>
      <p>Song and all difficulties included · {(selected.bytes.length / 1024 / 1024).toFixed(1)} MB</p>
      {revisions.length > 1 && <Field label="Revision"><select disabled={busy} value={selected.revision} onChange={event => void library.open(event.target.value)}>{revisions.map(row => <option key={row.revision} value={row.revision}>{row.importedAt ? new Date(row.importedAt).toLocaleString() : "Included version"} · {row.revision.slice(0, 8)}</option>)}</select></Field>}
      <p>Revision {selected.revision.slice(0, 12)}. Local scores are kept separately for each revision.</p>
      {selected.saved && !starterFile(selected.revision) && <Button size="sm" variant="danger" icon={<Icon name="trash" />} disabled={busy} onClick={() => void library.remove()}>Remove this revision</Button>}
    </details>
  </>;
}
