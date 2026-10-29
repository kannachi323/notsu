import { Link } from "react-router";
import type { useMapLibrary } from "../useMapLibrary";
import type { LibraryEntry } from "../domain/collection";
import { starterFile } from "../data/starters";
import { mapDuration, mapHue } from "./presentation";
import { CoverArt } from "../../../shared/components";
import { Badge, Button, EmptyState, Icon } from "../../../shared/components";

export function MapCollection({ library, cards, view, open, clear, play }: {
  library: ReturnType<typeof useMapLibrary>; cards: LibraryEntry[][]; view:"select"|"browse";
  open:(revision:string)=>void; clear:()=>void; play:()=>void;
}) {
  const { selected, busy } = library;
  return <div className={view === "browse" ? "browse-grid" : "song-carousel"} onKeyDown={event => {
    if (view === "select" && event.key === "Enter" && !event.repeat && !busy && event.target instanceof HTMLElement &&
      (event.target.matches("input[type=radio]") || (event.target.matches("button[data-map]") && event.target.closest(".is-selected")))) {
      event.preventDefault(); play(); return;
    }
    if (busy || !["ArrowDown","ArrowUp","Home","End"].includes(event.key) || !(event.target instanceof HTMLElement) || !event.target.matches("button[data-map]")) return;
    const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button[data-map]")], index = buttons.indexOf(event.target as HTMLButtonElement);
    const next = event.key === "Home" ? 0 : event.key === "End" ? buttons.length-1 : (index + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
    event.preventDefault(); buttons[next]?.focus(); buttons[next]?.click(); buttons[next]?.scrollIntoView({ block:"nearest" });
  }}>
    {cards.map(entries => { const card = entries[0], active = selected?.set.id === card.setId; return <article key={card.setId} className={`song-entry ${active ? "is-selected" : ""} artwork-${mapHue(card.setId)}`}>
      <button data-map={card.revision} className="song-card" aria-pressed={active} aria-disabled={busy || undefined} onClick={() => { if (!busy) open(card.revision); }}>
        <span className="song-card-image" aria-hidden="true"><CoverArt seed={card.setId}/></span><span className="song-card-cover" aria-hidden="true"><CoverArt seed={card.setId}/></span><span className="song-card-copy"><strong>{card.title}</strong><span>{card.artist}</span><small>mapped by {card.author}</small><span className="song-card-tags"><Badge tone={starterFile(card.revision) ? "neutral" : "violet"}>{starterFile(card.revision) ? "Included" : "Local"}</Badge><span className="difficulty-pips" role="img" aria-label={`${card.difficulties.length} difficulties`}>{card.difficulties.map(d => <i key={d.id} aria-hidden="true"/>)}</span><span>{mapDuration(Math.max(...card.difficulties.map(d => d.durationMs)))}</span>{card.favorite && <span className="song-card-favorite" role="img" aria-label="Favorite">★</span>}</span></span><span className="song-card-arrow" aria-hidden="true"><Icon name={active ? "play" : "forward"} /></span>
      </button>
      {active && selected && view === "select" && <fieldset className="song-difficulties" disabled={busy}><legend className="visually-hidden">Choose a difficulty</legend>{selected.set.difficulties.map((item,index) => <label key={item.chart.id} className={library.difficultyId === item.chart.id ? "chosen" : ""}><input type="radio" name="difficulty" checked={library.difficultyId === item.chart.id} onChange={() => library.setDifficultyId(item.chart.id)}/><span className="difficulty-symbol" aria-hidden="true">{index ? "◇" : "◈"}</span><span><strong>{item.name}</strong><small>{item.chart.notes.length} circles · {item.chart.lanes.length} lines{!item.chart.notes.length ? " · Draft" : ""}</small></span><span className="difficulty-mapper">{item.author}</span></label>)}</fieldset>}
      {view === "browse" && <Link className="browse-card-footer" to={`/rhythm?map=${card.revision}`}><span>Choose difficulty</span><Icon name="forward" /></Link>}
    </article>; })}
    {!cards.length && <EmptyState title="No matching maps" description="Try another search or clear the filters." action={<Button onClick={clear}>Show all maps</Button>} />}
  </div>;
}
