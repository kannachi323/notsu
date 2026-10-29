import { useEffect, useState } from "react";
import { buttonClass } from "./Button";
import type { ButtonSize } from "./Button";

/** A real download link for in-memory archive bytes, styled as a secondary button. */
export function DownloadLink({ bytes, fileName, size = "sm", children }: { bytes: Uint8Array; fileName: string; size?: ButtonSize; children: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/zip" })); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [bytes]);
  return url ? <a className={buttonClass({ size })} href={url} download={fileName}><span className="ui-button__content">{children}</span></a> : <span className="ui-loading" role="status">Preparing download…</span>;
}
