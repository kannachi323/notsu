// Library metadata belongs to this feature; filtering never needs storage or React.
import type { PublishedDifficulty } from "./published";
export type LibraryEntry = {
  revision: string; setId: string; title: string; artist: string; author: string;
  importedAt: number; favorite: boolean; difficulties: PublishedDifficulty[];
};
export type MapSort = "recent" | "title" | "artist" | "length";
export function mapCollection(maps: LibraryEntry[], query: string, favorites: boolean, sort: MapSort): LibraryEntry[][] {
  const words = query.toLowerCase().trim().split(/\s+/), groups = new Map<string, LibraryEntry[]>();
  // Keep the most recently imported revision as the representative, regardless of input order.
  for (const row of [...maps].sort((a,b) => b.importedAt - a.importedAt)) {
    const text = [row.title,row.artist,row.author,...row.difficulties.flatMap(d => [d.name,d.author])].join(" ").toLowerCase();
    if ((favorites && !row.favorite) || !words.every(word => text.includes(word))) continue;
    groups.set(row.setId,[...(groups.get(row.setId) ?? []),row]);
  }
  const length = (row: LibraryEntry) => Math.max(...row.difficulties.map(d => d.durationMs));
  return [...groups.values()].sort((a,b) => {
    const order = sort === "title" ? a[0].title.localeCompare(b[0].title) : sort === "artist" ? a[0].artist.localeCompare(b[0].artist) : sort === "length" ? length(a[0]) - length(b[0]) : b[0].importedAt - a[0].importedAt;
    return order || a[0].title.localeCompare(b[0].title);
  });
}
