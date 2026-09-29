import { useEffect, useRef, useState } from "react";
import { RhythmAudio } from "../rhythm/data/audio";
import { createDocument, readDocument, restoreDocument } from "./domain/document";
import type { EditorDocument } from "./domain/document";
import { EditorHistory } from "./domain/history";
import type { EditorCommand } from "./domain/commands";
import { decodeSong, importSong } from "./data/song";
import type { ImportedSong } from "./data/song";
import { createDraft, listDrafts, readDraft } from "./data/storage";
import type { DraftSummary } from "./data/storage";
import { DraftWriter } from "./data/DraftWriter";

type Workspace = { document: EditorDocument; song: ImportedSong; history: EditorHistory; writer: DraftWriter | null };
export function useEditor() {
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saveStatus, setSaveStatus] = useState("");
  const [timeMs, setTimeMs] = useState(0), [playing, setPlaying] = useState(false);
  const audioRef = useRef<RhythmAudio | null>(null), active = useRef<Workspace | null>(null);
  const mounted = useRef(true), generation = useRef(0), playingRef = useRef(false);
  const clock = () => audioRef.current ??= new RhythmAudio();
  const refresh = () => listDrafts().then(rows => { if (mounted.current) setDrafts(rows); }).catch(cause => { if (mounted.current) setError(message(cause)); });
  const stop = () => { generation.current++; audioRef.current?.stop(); playingRef.current = false; setPlaying(false); };
  async function flush() {
    const current = active.current;
    if (!current?.writer) return;
    try { await current.writer.flush(); if (mounted.current && active.current === current) setSaveStatus("Saved on this device"); }
    catch (cause) { if (mounted.current && active.current === current) { setSaveStatus("Changes not saved"); setError(message(cause)); } throw cause; }
  }
  useEffect(() => {
    mounted.current = true; void refresh();
    let frame = 0, last = 0;
    const tick = (now: number) => {
      if (playingRef.current && audioRef.current && active.current) {
        const time = Math.max(0, audioRef.current.timeAt());
        if (audioRef.current.context.state !== "running" || time >= active.current.document.chart.durationMs) stop();
        if (now - last > 30) { setTimeMs(Math.min(time, active.current.document.chart.durationMs)); last = now; }
      }
      frame = requestAnimationFrame(tick);
    }; frame = requestAnimationFrame(tick);
    const hidden = () => { if (document.hidden) stop(); };
    const leaving = (event: BeforeUnloadEvent) => { if (active.current && (!active.current.writer || active.current.writer.dirty)) { event.preventDefault(); event.returnValue = ""; } };
    document.addEventListener("visibilitychange", hidden); window.addEventListener("beforeunload", leaving);
    return () => {
      mounted.current = false; generation.current++; cancelAnimationFrame(frame); playingRef.current = false;
      audioRef.current?.dispose(); audioRef.current = null;
      void active.current?.writer?.flush().catch(() => {});
      document.removeEventListener("visibilitychange", hidden); window.removeEventListener("beforeunload", leaving);
    };
  }, []);
  useEffect(() => {
    if (!workspace?.writer?.dirty) return;
    const timer = setTimeout(() => { void flush().catch(() => {}); }, 400); return () => clearTimeout(timer);
  }, [workspace]);
  async function open(fileOrId: File | string, restored?: EditorDocument) {
    if (busy) return;
    stop(); const token = ++generation.current; setBusy(true); setError("");
    try {
      let song: ImportedSong, doc: EditorDocument, writer: DraftWriter | null;
      if (typeof fileOrId === "string") {
        const { row, blob } = await readDraft(fileOrId); doc = row.document;
        song = await decodeSong(await blob.arrayBuffer(), doc.song.fileName, clock().context, doc.song.sha256);
        if (Math.abs(song.reference.durationMs - doc.song.durationMs) > 25) throw new Error("The recording duration no longer matches this draft.");
        writer = new DraftWriter(row.revision);
      } else {
        song = await importSong(fileOrId, clock().context, restored?.song.sha256);
        const id = crypto.randomUUID();
        doc = restored ? restoreDocument(id, restored, song.reference) : createDocument(id, song.reference, fileOrId.name.replace(/\.(mp3|wav)$/i, "").slice(0, 256));
        try { writer = new DraftWriter((await createDraft(doc, song.bytes)).revision); }
        catch (cause) { writer = null; if (mounted.current) setError(`Session only: ${message(cause)} Keep this window open and back up your draft before leaving.`); }
      }
      if (!mounted.current || token !== generation.current) return;
      const next = { document: doc, song, writer, history: new EditorHistory(doc) };
      active.current = next; setWorkspace(next); setTimeMs(0); setSaveStatus(writer ? "Saved on this device" : "Session only · not saved");
    } catch (cause) { if (mounted.current && token === generation.current) setError(message(cause)); }
    finally { if (mounted.current) setBusy(false); }
  }
  function change(command: EditorCommand | "undo" | "redo") {
    const current = active.current; if (!current) return;
    stop(); setError("");
    try {
      const doc = command === "undo" ? current.history.undo() : command === "redo" ? current.history.redo() : current.history.apply(command);
      if (JSON.stringify(doc) === JSON.stringify(current.document)) return;
      const next = { ...current, document: doc }; active.current = next; setWorkspace(next);
      current.writer?.enqueue(doc); setSaveStatus(current.writer ? "Saving…" : "Session only · not saved");
    } catch (cause) { setError(message(cause)); }
  }
  function seek(time: number) { if (!Number.isFinite(time)) return; stop(); setTimeMs(Math.max(0, Math.min(active.current?.document.chart.durationMs ?? 0, time))); }
  async function listen() {
    if (playingRef.current) { stop(); return; }
    const current = active.current; if (!current) return;
    const token = ++generation.current, from = timeMs >= current.document.chart.durationMs ? 0 : timeMs;
    try {
      if (!await clock().start(current.song.buffer, current.document.chart, .6, from, 0) || token !== generation.current || !mounted.current) return;
      playingRef.current = true; setPlaying(true); setTimeMs(from);
    } catch (cause) { setError(message(cause)); }
  }
  async function close(discard = false) {
    stop();
    if (!discard) {
      try { await flush(); } catch { return; }
      if (!active.current?.writer) { setError("This draft has not been saved. Back up your draft before leaving this session."); return; }
    }
    active.current = null; setWorkspace(null); setError(""); await refresh();
  }
  return { workspace, drafts, busy, error, saveStatus, timeMs, playing, open, change, seek, listen, stop, close, flush, setError,
    currentDocument: () => active.current && readDocument(active.current.document) };
}
function message(cause: unknown) { return cause instanceof Error ? cause.message : "Something went wrong. Please try again."; }
