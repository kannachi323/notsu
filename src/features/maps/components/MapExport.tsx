import { useState } from "react";
import { Button, DownloadLink, Icon, Notice } from "../../../shared/components";
import { desktopMapSave, mapFileName, saveMapPack } from "../data/savePack";
export function MapExport({ bytes, title }: { bytes: Uint8Array; title: string }) {
  const [busy, setBusy] = useState(false), [status, setStatus] = useState(""), [error, setError] = useState("");
  async function save() {
    setBusy(true); setError(""); setStatus("");
    try { setStatus(await saveMapPack(bytes, title) ? "Map package saved." : "Save cancelled."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the package."); }
    finally { setBusy(false); }
  }
  return <>
    {desktopMapSave() ? <Button size="sm" icon={<Icon name="download" />} disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save map package"}</Button> : <DownloadLink bytes={bytes} fileName={mapFileName(title)}>Download map package</DownloadLink>}
    {status && <p className="map-export-status" role="status">{status}</p>}{error && <Notice tone="danger" role="alert">{error}</Notice>}
  </>;
}
