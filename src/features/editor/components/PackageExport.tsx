import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import type { EditorDocument } from "../domain/document";
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
  return <section className="editor-package" aria-label="Map package export"><div><h2>Take your map with you</h2>
    <p>A .notsumap package includes the original song, choreography and circles.</p>
    <label><input type="checkbox" checked={includeSet} disabled={busy} onChange={event => setIncludeSet(event.target.checked)} /> Include other saved difficulties in this map set</label>
    <p className="editor-hint">Each difficulty needs a unique name. Share only recordings you have permission to distribute.</p></div>
    <div className="editor-small-actions"><button disabled={busy} onClick={() => void prepare()}>{busy ? "Preparing…" : "Prepare map package"}</button>
      {prepared && <><MapExport bytes={prepared.bytes} title={document.chart.title} /><button disabled={busy || saved} onClick={() => void addToLibrary()}>{saved ? "Added to library" : "Add to local library"}</button></>}
      {saved && <Link to="/browse">Open map browser</Link>}</div>
    {error && <p role="alert" className="editor-error">{error}</p>}
  </section>;
}
