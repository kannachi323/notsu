import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { playableChart } from "../domain/document";
import type { EditorDocument } from "../domain/document";
import { motionIssues, READABLE_TARGET_PX_PER_S, READABLE_TURN_DEG_PER_S } from "../../rhythm/domain/readability";

const clock = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
import { readSetDrafts } from "../data/storage";
import { draftMapSet } from "../data/mapSet";
import { mapJob } from "../../maps/data/packageClient";
import { MapExport } from "../../maps/components/MapExport";
import { storeMap } from "../../maps/data/storage";
import type { LoadedMap } from "../../maps/data/package";

export function PackageExport({ document, audio }: { document: EditorDocument; audio: ArrayBuffer }) {
  const [includeSet, setIncludeSet] = useState(false), [prepared, setPrepared] = useState<{ bytes: Uint8Array; revision: string }>();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const generation = useRef(0);
  const issues = useMemo(() => { try { return motionIssues(playableChart(document)); } catch { return []; } }, [document]);
  useEffect(() => { generation.current++; setPrepared(undefined); setSaved(false); return () => { generation.current++; }; }, [document, includeSet]);
  async function prepare() {
    setBusy(true); setError(""); setSaved(false);
    const token = generation.current;
    try {
      const documents = includeSet ? await readSetDrafts(document.setId) : [];
      const result = await mapJob<{ bytes: Uint8Array; revision: string }>({ action: "pack", set: draftMapSet(document, documents), audio: new Uint8Array(audio) });
      if (token === generation.current) setPrepared(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not prepare the package."); }
    finally { setBusy(false); }
  }
  async function addToLibrary() {
    if (!prepared) return;
    const token = generation.current;
    setBusy(true); setError("");
    try { const loaded = await mapJob<LoadedMap>({ action: "unpack", bytes: prepared.bytes }); await storeMap(loaded, prepared.bytes); if (token === generation.current) setSaved(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not add this map to the library."); }
    finally { setBusy(false); }
  }
  return <section className="editor-package" aria-label="Map package export"><div><h2>Export</h2>
    <p>A .notsumap pack with the song and every circle.</p>
    <label><input type="checkbox" checked={includeSet} disabled={busy} onChange={event => setIncludeSet(event.target.checked)} /> Include other difficulties</label>
    <p className="editor-hint">Share only music you have the rights to.</p>
    {issues.length > 0 && <div className="editor-hint" role="status"><p>Hard to sightread: {issues.length === 1 ? "one line moves" : `lines move ${issues.length} times`} quickly while notes are on them.</p>
      <ul>{issues.slice(0, 3).map(issue => <li key={`${issue.laneId}-${issue.kind}-${issue.startMs}`}>{clock(issue.startMs)} · line {issue.laneId} {issue.kind === "turn" ? `turns ${issue.peak}°/s (limit ${READABLE_TURN_DEG_PER_S})` : `target moves ${issue.peak} px/s (limit ${READABLE_TARGET_PX_PER_S})`}</li>)}</ul></div>}</div>
    <div className="editor-small-actions"><button disabled={busy} onClick={() => void prepare()}>{busy ? "Preparing…" : "Prepare pack"}</button>
      {prepared && <><MapExport bytes={prepared.bytes} title={document.chart.title} /><button disabled={busy || saved} onClick={() => void addToLibrary()}>{saved ? "Added to library" : "Add to local library"}</button></>}
      {saved && <Link to="/browse">Open map browser</Link>}</div>
    {error && <p role="alert" className="editor-error">{error}</p>}
  </section>;
}
