import type { LoadedMap } from "./package";
import type { MapSummary } from "./storage";
// Recovery when IndexedDB is unavailable. Keep validated packs across route
// changes for this app session; never silently pretend they were saved to disk.
type SessionMap = LoadedMap & { bytes:Uint8Array; summary:MapSummary };
const packs = new Map<string,SessionMap>(), maxBytes=256*1024*1024;
export function keepSessionMap(loaded:LoadedMap,bytes:Uint8Array) {
  const prior=packs.get(loaded.revision), total=[...packs.values()].reduce((sum,pack)=>sum+pack.bytes.length,0);
  if ((!prior && packs.size>=20) || total-(prior?.bytes.length ?? 0)+bytes.length>maxBytes) throw new Error("Temporary map storage is full. Export your packs and reopen the app to clear it.");
  const { set }=loaded;
  packs.set(loaded.revision,{ ...loaded,bytes,summary:{ revision:loaded.revision,setId:set.id,title:set.title,artist:set.artist,author:set.author,
    importedAt:prior?.summary.importedAt ?? Date.now(),favorite:prior?.summary.favorite ?? false,
    difficulties:set.difficulties.map(({ name,author,chart })=>({ id:chart.id,name,author,notes:chart.notes.length,lanes:chart.lanes.length,durationMs:chart.durationMs })),
  } });
}
export const readSessionMap = (revision:string) => packs.get(revision);
export const sessionMapSummaries = () => [...packs.values()].map(pack=>pack.summary);
export const forgetSessionMap = (revision:string) => packs.delete(revision);
export function favoriteSessionMap(revision:string) { const pack=packs.get(revision); if (pack) pack.summary={ ...pack.summary,favorite:!pack.summary.favorite }; }
