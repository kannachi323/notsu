import { useEffect, useRef, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import type { EditorDocument } from "../domain/document";

export function DraftBackup({ document }: { document: EditorDocument }) {
  const [url, setUrl] = useState(""), text = useRef<HTMLTextAreaElement>(null), json = JSON.stringify(document, null, 2);
  useEffect(() => { const value = URL.createObjectURL(new Blob([json], { type: "application/json" })); setUrl(value); return () => URL.revokeObjectURL(value); }, [json]);
  return <details className="editor-details"><summary>Back up draft</summary><p className="editor-hint">Chart and movement only. Keep <strong>{document.song.fileName}</strong> with it.</p>
    {!isTauri() && url && <a className="editor-button" href={url} download={`notsu-${document.id}.notsudraft.json`}>Download draft JSON</a>}
    <button onClick={() => { text.current?.focus(); text.current?.select(); }}>Select backup text</button>
    <textarea ref={text} aria-label="Draft backup JSON" value={json} readOnly rows={6} spellCheck={false} />
  </details>;
}
