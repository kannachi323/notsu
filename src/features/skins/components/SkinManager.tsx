import { useEffect, useRef, useState } from "react";
import { builtinSkins } from "../domain/builtins";
import type { SoundName } from "../domain/manifest";
import { getSkin } from "../data/registry";
import type { SkinRecord } from "../data/registry";
import { SkinExport } from "./SkinExport";
import { importSkin, initializeSkins, prepareSkin, removeSkin, restoreSkin, useSkinCatalog } from "../useSkinCatalog";
import { HitSounds } from "../../rhythm/data/hitSounds";
import { SkinPreview } from "./SkinPreview";
import "../skins.css";

export function SkinManager({ skinId, volume, select }: { skinId: string; volume: number; select: (id: string) => void }) {
  const { items, ready, revision, notice } = useSkinCatalog();
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [status, setStatus] = useState("");
  const [warnings, setWarnings] = useState<string[]>([]), [previewRevision, setPreviewRevision] = useState(0);
  const [removed, setRemoved] = useState<SkinRecord>();
  const audio = useRef<{ context: AudioContext; sounds: HitSounds } | null>(null);
  const mounted = useRef(true);
  const selectRef = useRef(select);
  useEffect(() => { selectRef.current = select; }, [select]);
  useEffect(() => { if (volume <= 0) audio.current?.sounds.stop(); }, [volume]);
  const installed = items.find(item => item.id === skinId);
  useEffect(() => {
    mounted.current = true; void initializeSkins();
    return () => { mounted.current = false; audio.current?.sounds.stop(); void audio.current?.context.close(); audio.current = null; };
  }, []);
  useEffect(() => {
    let cancelled = false; audio.current?.sounds.stop();
    setWarnings([]);
    void prepareSkin(skinId).then(assets => {
      if (!cancelled) { setWarnings(assets?.warnings ?? []); setPreviewRevision(value => value + 1); }
    });
    return () => { cancelled = true; };
  }, [skinId, revision]);

  async function action(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(""); setStatus("");
    try { await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "The skin could not be processed. Try again."); }
    finally { setBusy(false); }
  }
  async function testSound(kind: SoundName) {
    try {
      const player = audio.current ??= (() => { const context = new AudioContext({ latencyHint: "interactive" }); return { context, sounds: new HitSounds(context) }; })();
      await player.context.resume();
      const assets = await prepareSkin(skinId);
      if (audio.current !== player) return;
      player.sounds.setSamples(assets?.sounds ?? {});
      player.sounds.play(getSkin(skinId).sounds[kind], volume, kind);
      setStatus(volume === 0 ? "Hit sounds are muted. Raise hit sound volume to preview." : `Playing ${kind === "tap" ? "tap" : "release"} sound.`);
    } catch { setError("Audio preview could not start. Try again after enabling audio in your browser."); }
  }
  return <div className="skin-manager" aria-busy={busy || !ready}>
    <label htmlFor="skin">Skin</label>
    <select id="skin" value={skinId} disabled={busy || !ready} onChange={event => select(event.target.value)}>
      {builtinSkins.map(skin => <option key={skin.id} value={skin.id}>{skin.name}</option>)}
      {items.map(item => <option key={item.id} value={item.id}>{item.manifest.name} · {item.manifest.author}</option>)}
      {skinId.startsWith("skin:") && !installed && <option value={skinId}>Unavailable skin · using Midnight</option>}
    </select>
    <SkinPreview id={skinId} revision={previewRevision} />
    <div className="skin-actions">
      <button type="button" disabled={busy || !ready} onClick={() => void testSound("tap")}>Hear tap</button>
      <button type="button" disabled={busy || !ready} onClick={() => void testSound("release")}>Hear release</button>
    </div>
    <label className="skin-import" htmlFor="skin-file">Import a skin pack</label>
    <input id="skin-file" type="file" accept=".notsuskin,.zip,application/zip" disabled={busy || !ready} aria-describedby="skin-import-help"
      onChange={event => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (file) void action(async () => {
          const record = await importSkin(file);
          if (mounted.current) { selectRef.current(record.id); setStatus(`Imported ${record.manifest.name}.`); }
        });
      }} />
    <p id="skin-import-help">Choose a .notsuskin pack up to 16 MB. Artwork, sounds, and colors can change; hit timing stays the same.</p>
    <SkinExport record={installed} busy={busy} action={action} notify={setStatus} />
    <div className="skin-actions skin-management-actions">
      {installed && <>
        <button type="button" disabled={busy} onClick={() => void action(async () => {
          const record = await removeSkin(installed.id);
          if (mounted.current) { setRemoved(record); selectRef.current("midnight"); setStatus("Skin removed. You can undo this."); }
        })}>Remove skin</button>
      </>}
      {removed && <button type="button" disabled={busy} onClick={() => void action(async () => {
        await restoreSkin(removed);
        if (mounted.current) { selectRef.current(removed.id); setRemoved(undefined); setStatus("Skin restored."); }
      })}>Undo removal</button>}
    </div>
    <p className="skin-status" role="status">{busy ? "Preparing skin…" : !ready ? "Loading saved skins…" : status}</p>
    {error && <p role="alert" className="skin-error">{error}</p>}
    {notice && <p className="skin-notice">{notice}</p>}
    {warnings.length > 0 && <details className="skin-warnings"><summary>{warnings.length} asset {warnings.length === 1 ? "fallback" : "fallbacks"}</summary>
      <ul>{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></details>}
  </div>;
}
