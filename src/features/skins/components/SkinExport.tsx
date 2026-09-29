import { useEffect, useState } from "react";
import { starterSkin } from "../data/exportPack";
import { desktopSkinSave, saveSkinPack, skinFileName } from "../data/savePack";
import type { SkinRecord } from "../data/registry";
import { DownloadLink } from "../../../shared/components/DownloadLink";

/** Browser downloads remain real links activated directly by the player. */
export function SkinExport({ record, busy, action, notify }: {
  record?: SkinRecord; busy: boolean; action: (operation: () => Promise<void>) => Promise<void>; notify: (text: string) => void;
}) {
  const [starter, setStarter] = useState<Uint8Array>(), [error, setError] = useState("");
  useEffect(() => {
    let cancelled = false;
    void starterSkin().then(bytes => { if (!cancelled) setStarter(bytes); })
      .catch(() => { if (!cancelled) setError("The starter pack could not be prepared. Reopen Settings to try again."); });
    return () => { cancelled = true; };
  }, []);
  const native = desktopSkinSave();
  const save = (bytes: Uint8Array, name: string) => void action(async () => {
    const saved = await saveSkinPack(bytes, name); notify(saved ? "Skin pack saved." : "Save cancelled. Your skin is unchanged.");
  });
  return <>
    <div className="skin-actions">
      {starter ? native ? <button type="button" disabled={busy} onClick={() => save(starter, "my-first-skin")}>Save starter</button>
        : <DownloadLink bytes={starter} fileName={skinFileName("my-first-skin")}>Download starter</DownloadLink> : !error && <span role="status">Preparing starter…</span>}
      {record && (native ? <button type="button" disabled={busy} onClick={() => save(record.archive, record.manifest.name)}>Export skin</button>
        : <DownloadLink bytes={record.archive} fileName={skinFileName(record.manifest.name)}>Export skin</DownloadLink>)}
    </div>
    {error && <p role="alert" className="skin-error">{error}</p>}
  </>;
}
