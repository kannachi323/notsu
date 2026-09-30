import { useEffect, useRef, useState } from "react";
import { decodeSong } from "../../shared/audio/song";
import { mapJob } from "./data/packageClient";
import { MAX_MAP_BYTES } from "./data/package";
import type { LoadedMap } from "./data/package";
import { favoriteMap, listMaps, readMap, removeMap, restoreMap, storeMap } from "./data/storage";
import type { MapSummary, StoredMap } from "./data/storage";
import { loadLocalReplay } from "../records/data/service";
import type { LocalLevel } from "../rhythm/useRhythmGame";
import { starterFile, starterMaps, withStarterMaps } from "./data/starters";
import { DEFAULT_MODS, type Mods } from "../rhythm/domain/rules";

export function useMapLibrary(initialRevision?: string) {
  const [maps, setMaps] = useState<MapSummary[]>([]), [selected, setSelected] = useState<(LoadedMap & { bytes: Uint8Array; saved: boolean })>();
  const [difficultyId, setDifficultyId] = useState(""), [playing, setPlaying] = useState<LocalLevel>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [removed, setRemoved] = useState<StoredMap>();
  const mounted = useRef(true), working = useRef(false), decoder = useRef<AudioContext | null>(null);
  const message = (cause: unknown) => cause instanceof Error ? cause.message : "The map could not be loaded.";
  async function refresh() {
    const catalog = await listMaps();
    const maps = withStarterMaps(catalog.maps);
    if (mounted.current) { setMaps(maps); if (catalog.unreadable) setNotice(`${catalog.unreadable} saved map entries could not be read. Import their original packages to recover them.`); }
    return maps;
  }
  useEffect(() => {
    mounted.current = true;
    void run(async () => {
      let rows: MapSummary[];
      try { rows = await refresh(); }
      catch {
        rows = starterMaps;
        if (mounted.current) {
          setMaps(rows);
          setNotice("Local storage is unavailable. Included maps are still playable; imported packs will last for this session.");
        }
      }
      await load(initialRevision ?? rows[0]?.revision);
    });
    return () => { mounted.current = false; void decoder.current?.close(); decoder.current = null; };
  }, []);
  async function run(operation: () => Promise<void>) {
    if (working.current) return;
    working.current = true; setBusy(true); setError(""); setNotice("");
    try { await operation(); }
    catch (cause) { if (mounted.current) setError(message(cause)); }
    finally { working.current = false; if (mounted.current) setBusy(false); }
  }
  function select(loaded: LoadedMap, bytes: Uint8Array, saved: boolean) {
    if (!mounted.current) return;
    setSelected({ ...loaded, bytes, saved }); setDifficultyId(loaded.set.difficulties.find(d => d.chart.notes.length)?.chart.id ?? loaded.set.difficulties[0].chart.id);
  }
  async function load(revision?: string) {
    if (!revision || !mounted.current) return;
    const bundled = starterFile(revision);
    let bytes: Uint8Array;
    if (bundled) {
      const response = await fetch(`${import.meta.env.BASE_URL}maps/${bundled}`, { credentials: "omit", signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("The included map could not load. Please retry.");
      bytes = new Uint8Array(await response.arrayBuffer());
    } else {
      const row = await readMap(revision); bytes = new Uint8Array(await row.archive.arrayBuffer());
    }
    const loaded = await mapJob<LoadedMap>({ action: "unpack", bytes });
    if (loaded.revision !== revision) throw new Error("The saved package no longer matches this revision. Import the original package again.");
    select(loaded, bytes, !bundled);
  }
  const open = (revision: string) => run(() => load(revision));
  const importFile = (file: File) => run(async () => {
    if (!/\.notsumap$/i.test(file.name) || file.size < 22 || file.size > MAX_MAP_BYTES) throw new Error("Choose a .notsumap package up to 128 MB.");
    const bytes = new Uint8Array(await file.arrayBuffer()), loaded = await mapJob<LoadedMap>({ action: "unpack", bytes });
    let saved = true;
    try { await storeMap(loaded, bytes); await refresh(); }
    catch (cause) { saved = false; if (mounted.current) setNotice(`Available for this session only. ${message(cause)} Keep the original package to import it again.`); }
    select(loaded, bytes, saved);
  });
  const play = (recordId?: string, mods: Mods = { ...DEFAULT_MODS }) => run(async () => {
    const difficulty = selected?.set.difficulties.find(d => d.chart.id === difficultyId);
    if (!selected || !difficulty?.chart.notes.length) throw new Error("This difficulty needs at least one circle before it can be played.");
    const context = decoder.current ??= new AudioContext();
    const song = await decodeSong(new Uint8Array(selected.audio).buffer, selected.set.song.mime === "audio/mpeg" ? "audio.mp3" : "audio.wav", context, selected.set.song.sha256, false);
    if (Math.abs(song.reference.durationMs - selected.set.song.durationMs) > 25 || difficulty.chart.audioOffsetMs + difficulty.chart.durationMs > song.reference.durationMs + 1) {
      throw new Error("The recording duration does not match this map. Repair it in the editor before playing.");
    }
    const recordSource = { revision: selected.revision, setId: selected.set.id, difficulty: difficulty.name };
    const savedReplay = recordId ? await loadLocalReplay(recordId, difficulty.chart, recordSource) : undefined;
    if (mounted.current) setPlaying({ chart: difficulty.chart, buffer: song.buffer, recordSource, savedReplay, autoStart: true, initialMods: mods });
  });
  const favorite = (row: MapSummary) => run(async () => {
    if (starterFile(row.revision) && selected?.revision === row.revision) await storeMap(selected, selected.bytes);
    await favoriteMap(row.revision, !row.favorite); await refresh();
  });
  const remove = () => run(async () => {
    if (!selected?.saved) return;
    const row = await removeMap(selected.revision);
    if (mounted.current) { setRemoved(row); setSelected(undefined); }
    await refresh();
  });
  const undo = () => run(async () => {
    if (!removed) return;
    await restoreMap(removed); if (mounted.current) setRemoved(undefined); await refresh();
  });
  return { maps, selected, difficultyId, setDifficultyId, playing, closePlay: () => setPlaying(undefined), busy, error, notice, removed,
    open, importFile, play, favorite, remove, undo };
}
