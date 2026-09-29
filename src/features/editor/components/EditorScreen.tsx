import { useEffect, useLayoutEffect, useState } from "react";
import { Link, useBlocker } from "react-router";
import { useEditor } from "../useEditor";
import { loadSettings } from "../../rhythm/data/settings";
import { getSkin, skinVariables } from "../../rhythm/components/skins";
import { initializeSkins, prepareSkin, useSkinCatalog } from "../../skins/useSkinCatalog";
import { RhythmScreen } from "../../rhythm/RhythmScreen";
import { playableChart, readDocument } from "../domain/document";
import type { EditorDocument } from "../domain/document";
import { snapTime } from "../../rhythm/domain/timing";
import { EditorStage } from "./EditorStage";
import { Timeline } from "./Timeline";
import { MapDetails } from "./MapDetails";
import { LaneTools } from "./LaneTools";
import { NoteTools } from "./NoteTools";
import { NoteSelection } from "./NoteSelection";
import { DraftLibrary } from "./DraftLibrary";
import { DraftRecovery } from "./DraftRecovery";
import { DraftBackup } from "./DraftBackup";
import { PackageExport } from "./PackageExport";
import { PlaybackControls } from "./PlaybackControls";

export function EditorScreen() {
  const editor = useEditor(), { workspace } = editor;
  const [settings] = useState(loadSettings), revision = useSkinCatalog(state => state.revision);
  const [selected, setSelected] = useState<string[]>([]), [divisor, setDivisor] = useState(4), [preview, setPreview] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<string[]>([]);
  const [restored, setRestored] = useState<EditorDocument | undefined>(), [restoreText, setRestoreText] = useState("");
  const [discard, setDiscard] = useState(false);
  const [artReady, setArtReady] = useState(false);
  const blocker = useBlocker(() => !!workspace && (!workspace.writer || workspace.writer.dirty));
  useLayoutEffect(() => { for (const [key, value] of Object.entries(skinVariables(getSkin(settings.skinId)))) document.documentElement.style.setProperty(key, value); }, [settings.skinId, revision]);
  useEffect(() => {
    let cancelled = false;
    void initializeSkins().then(() => prepareSkin(settings.skinId)).then(() => { if (!cancelled) setArtReady(true); }).catch(() => {});
    return () => { cancelled = true; };
  }, [settings.skinId]);
  useEffect(() => {
    setSelected(workspace ? [workspace.document.chart.lanes[0].id] : []); setSelectedNotes([]); setPreview(false);
    if (workspace) { setRestored(undefined); setRestoreText(""); }
  }, [workspace?.document.id]);
  const heading = <header className="editor-header"><Link to="/" className="editor-brand">notsu</Link><h1>Editor</h1><span className="editor-save" role="status">{workspace ? editor.saveStatus : "Local drafts"}</span></header>;
  const warning = <>{editor.error && <p className="editor-error" role="alert">{editor.error}</p>}{blocker.state === "blocked" && <section className="editor-error" role="alert">
    <p>Your latest edits have not been saved. Stay to back them up, or leave without these changes.</p><div className="editor-small-actions"><button onClick={() => blocker.reset()}>Keep editing</button><button onClick={() => blocker.proceed()}>Leave without saving</button></div>
  </section>}</>;
  if (preview && workspace) return <><RhythmScreen preview={{ chart: playableChart(workspace.document), buffer: workspace.song.buffer, close: () => setPreview(false) }} />{warning}</>;
  if (!workspace) return <main className="editor-app">{heading}{warning}<section className="editor-start">
    <div className="editor-intro"><div className="editor-orbit" aria-hidden="true"><i /><i /><i /></div><h2>Every movement starts with a beat.</h2>
      <p>Choose a song, place circles on its rhythm, and choreograph the lines around them.</p>
      {restored && <p role="status">Restoring <strong>{restored.chart.title}</strong>. Choose its original <strong>{restored.song.fileName}</strong>.</p>}
      <label className="editor-song-label">{restored ? "Choose original recording" : "Create a map from a song"}<input type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" disabled={editor.busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void editor.open(file, restored); }} /></label>
      <p className="editor-hint">MP3 or WAV · up to 100 MB · stays on this device</p>{editor.busy && <p role="status">Preparing recording and waveform…</p>}
      <label className="editor-song-label">Import a complete map package<input type="file" accept=".notsumap" disabled={editor.busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ""; if (file) void editor.importPackage(file); }} /></label>
      <p className="editor-hint">Includes its song and all difficulties · up to 128 MB</p>
      <details className="editor-details"><summary>Restore a draft backup</summary><p>Paste the JSON from a draft backup, then choose its original song above.</p>
        <textarea aria-label="Draft JSON to restore" value={restoreText} onChange={event => setRestoreText(event.target.value)} rows={4} maxLength={4 * 1024 * 1024} spellCheck={false} autoCorrect="off" autoCapitalize="off" />
        <button onClick={() => { try { setRestored(readDocument(JSON.parse(restoreText))); editor.setError(""); } catch (cause) { editor.setError(cause instanceof Error ? cause.message : "Invalid draft backup."); } }}>Use backup</button>
        {restored && <button onClick={() => { setRestored(undefined); setRestoreText(""); }}>Cancel restore</button>}
      </details>
    </div><DraftLibrary drafts={editor.drafts} trash={editor.trash} notice={editor.notice} busy={editor.busy} open={editor.open} refresh={editor.refresh} manage={editor.manageDraft} />
  </section><footer>Unofficial community project · Not affiliated with ppy</footer></main>;
  const { document: doc, history } = workspace, chart = doc.chart;
  const selectedIds = selected.filter(id => chart.lanes.some(lane => lane.id === id));
  const existingNotes = new Set(chart.notes.map(note => note.id)), noteIds = selectedNotes.filter(id => existingNotes.has(id));
  const position = Math.round(editor.timeMs * 1000) / 1000;
  const place = (timeMs: number, laneId: string) => { setSelected([laneId]); editor.change({ type: "place", id: crypto.randomUUID(), timeMs, laneIds: [laneId], divisor }); };
  const previewMap = () => { try { playableChart(doc); editor.stop(); setPreview(true); } catch { editor.setError("Add at least one circle before playtesting."); } };
  return <main className="editor-app">{heading}{warning}
    <div className="editor-document-title"><div><h2>{chart.title}</h2><p>{chart.artist} <span>· {doc.difficulty}</span></p></div><div className="editor-small-actions">
      <button disabled={editor.busy} onClick={async () => { try { await editor.flush(); if (workspace.writer) await editor.close(); else setDiscard(true); } catch { setDiscard(true); } }}>Drafts</button><button className="primary" disabled={!chart.notes.length} onClick={previewMap}>Playtest</button>
    </div></div>
    {discard && <section className="editor-error"><p>Wait for autosave, or back up your draft before leaving. Unsaved changes will be lost if you discard them.</p>
      <button onClick={() => setDiscard(false)}>Keep editing</button><button onClick={() => { setDiscard(false); void editor.close(true); }}>Discard unsaved changes</button></section>}
    <DraftRecovery writer={workspace.writer} busy={editor.busy} recover={editor.recover} />
    <MapDetails document={doc} change={editor.change} />
    <div className="editor-small-actions"><button disabled={editor.busy} onClick={() => void editor.duplicate()}>Create another difficulty</button></div>
    <div className="editor-toolbar" aria-label="Editing controls"><button onClick={() => void editor.listen()}>{editor.playing ? "Pause song" : "Listen"}</button>
      <label>Position · ms<input aria-label="Playhead milliseconds" type="number" min={0} max={chart.durationMs} step="any" value={position} onChange={event => editor.seek(Number(event.target.value))} /></label>
      <label>Beat snap<select value={divisor} onChange={event => setDivisor(Number(event.target.value))}>{[1, 2, 3, 4, 6, 8, 12, 16].map(value => <option key={value} value={value}>1/{value} beat</option>)}</select></label>
      <button onClick={() => editor.seek(snapTime(chart.timing, editor.timeMs, divisor))}>Snap playhead</button>
      <button disabled={!history.canUndo} onClick={() => editor.change("undo")}>Undo</button><button disabled={!history.canRedo} onClick={() => editor.change("redo")}>Redo</button>
    </div>
    <PlaybackControls options={editor.playback} change={editor.configurePlayback} playing={editor.playing} remaining={editor.remaining} />
    <div className="editor-workspace" onFocusCapture={editor.stop}><LaneTools chart={chart} selected={selectedIds} select={setSelected} timeMs={position} change={editor.change} seek={editor.seek} />
      <div className="editor-center"><div className="editor-stage-shell"><EditorStage key={String(artReady)} chart={chart} timeMs={editor.timeMs} settings={settings} /><span className="editor-stage-label">Arrangement · {(editor.timeMs / 1000).toFixed(2)} s</span></div>
        <Timeline chart={chart} peaks={workspace.song.peaks} timeMs={editor.timeMs} divisor={divisor} seek={editor.seek} place={place} selected={noteIds} select={setSelectedNotes} change={editor.change} />
        <NoteSelection key={doc.id} chart={chart} ids={noteIds} select={setSelectedNotes} laneIds={selectedIds} timeMs={position} divisor={divisor} change={editor.change} />
      </div><NoteTools chart={chart} selected={selectedIds} noteIds={noteIds} selectNotes={setSelectedNotes} timeMs={position} divisor={divisor} change={editor.change} seek={editor.seek} /></div>
    <PackageExport key={doc.id} document={doc} audio={workspace.song.bytes} /><DraftBackup document={doc} /><footer>Local draft · {workspace.song.reference.fileName} · {(chart.durationMs / 1000).toFixed(1)} s · Unofficial community project</footer>
  </main>;
}
