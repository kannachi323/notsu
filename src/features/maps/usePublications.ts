import { useEffect, useRef, useState } from "react";
import { useAccountStore } from "../accounts/accountStore";
import { configuration } from "../accounts/data/auth";
import { ownOnlineMaps, publishOnlineMap, setOnlineVisibility } from "./data/online";
import type { PublishedMap } from "./domain/published";

export function usePublications() {
  const userId = useAccountStore(state=>state.identity?.id), profile = useAccountStore(state=>state.profile);
  const [items,setItems] = useState<PublishedMap[]>([]), [busy,setBusy] = useState(false), [error,setError] = useState(""), [notice,setNotice] = useState("");
  const [refresh,setRefresh] = useState(0), [loaded,setLoaded] = useState(false);
  const generation = useRef(0), working = useRef(false), upload = useRef<{ key:string; id:string } | null>(null);
  useEffect(() => {
    const token = ++generation.current, controller = new AbortController();
    setItems([]); setError(""); setNotice(""); setLoaded(false);
    if (!userId || !configuration) { setBusy(false); return () => { generation.current++; }; }
    setBusy(true);
    void ownOnlineMaps(controller.signal).then(rows => { if (token===generation.current) { setItems(rows); setLoaded(true); } })
      .catch(cause=>{ if (!controller.signal.aborted && token===generation.current) setError(cause instanceof Error ? cause.message : "Your publications could not load."); })
      .finally(()=>{ if (token===generation.current) setBusy(false); });
    return () => { generation.current++; controller.abort(); };
  },[userId,refresh]);
  function accept(map:PublishedMap) { setItems(previous=>[map,...previous.filter(row=>row.revision!==map.revision)].sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt))); }
  async function run(work:()=>Promise<PublishedMap>, message:string) {
    if (working.current || busy || !userId) return;
    working.current=true; const token=generation.current; setBusy(true); setError(""); setNotice("");
    try { const map=await work(); if (token===generation.current && useAccountStore.getState().identity?.id===userId) { accept(map); setNotice(message); } }
    catch(cause) { if (token===generation.current) setError(cause instanceof Error ? cause.message : "The change could not be confirmed. Refresh and retry."); }
    finally { working.current=false; if (token===generation.current) setBusy(false); }
  }
  const publish = (revision:string,bytes:Uint8Array) => {
    if (working.current || busy || !userId) return;
    const key=`${userId}:${revision}`;
    if (upload.current?.key!==key) upload.current={ key,id:crypto.randomUUID() };
    return run(()=>publishOnlineMap(revision,bytes,upload.current!.id),"Publication confirmed. Existing withdrawal or moderation decisions stay in effect.");
  };
  const visibility = (map:PublishedMap) => run(()=>setOnlineVisibility(map,!map.visible),map.visible ? "Map withdrawn from discovery and new downloads. Downloaded copies remain playable." : "Map restored to discovery.");
  return { items,busy,error,notice,loaded,userId,profile,publish,visibility,refresh:()=>{ if (!working.current) setRefresh(value=>value+1); } };
}
