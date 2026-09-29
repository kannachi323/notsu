import { useState } from "react";
import { DownloadLink } from "../../../shared/components/DownloadLink";
import { desktopMapSave, mapFileName, saveMapPack } from "../data/savePack";
export function MapExport({ bytes, title }: { bytes: Uint8Array; title: string }) {
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(""), [error, setError] = useState("");
  async function save() {
    setBusy(true); setError(""); setStatus("");
    try { setStatus(await saveMapPack(bytes, title) ? "Map package saved." : "Save cancelled."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the package."); }
    finally { setBusy(false); }
  }
  return <div className="map-export">
    {desktopMapSave() ? <button disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save map package"}</button> : <DownloadLink bytes={bytes} fileName={mapFileName(title)}>Download map package</DownloadLink>}
    {status && <p role="status">{status}</p>}{error && <p role="alert">{error}</p>}
  </div>;
}
