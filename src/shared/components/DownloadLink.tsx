import { useEffect, useState } from "react";
export function DownloadLink({ bytes, fileName, children }: { bytes: Uint8Array; fileName: string; children: string }) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    const next = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/zip" })); setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [bytes]);
  return url ? <a href={url} download={fileName}>{children}</a> : <span role="status">Preparing download…</span>;
}
