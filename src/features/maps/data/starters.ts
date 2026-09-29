import catalog from "./starterCatalog.json";
import type { MapSummary } from "./storage";

export const starterMaps: MapSummary[] = catalog;
export const starterFile = (revision: string) => catalog.find(row => row.revision === revision)?.file;
export function withStarterMaps(saved: MapSummary[]): MapSummary[] {
  const revisions = new Set(saved.map(row => row.revision));
  return [...saved, ...starterMaps.filter(row => !revisions.has(row.revision))];
}
