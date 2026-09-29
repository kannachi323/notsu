import { useEffect,useRef,useState } from "react";
import { useAccountStore } from "./accountStore";
import { watchAccountUpdates,type LiveStatus } from "./data/liveUpdates";

export function useAccountUpdates(onChange:()=>void) {
  const id=useAccountStore(state=>state.identity?.id),callback=useRef(onChange);
  const [status,setStatus]=useState<LiveStatus>("connecting");
  callback.current=onChange;
  useEffect(()=>{
    if(!id)return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const changed=()=>{if(timer===undefined)timer=setTimeout(()=>{timer=undefined;callback.current();},120);};
    const stop=watchAccountUpdates(id,changed,setStatus);
    // A missed hint is repaired on focus; no message polling during gameplay.
    const focus=()=>{if(document.visibilityState==="visible")changed();};
    window.addEventListener("focus",focus);document.addEventListener("visibilitychange",focus);
    return ()=>{stop();clearTimeout(timer);window.removeEventListener("focus",focus);document.removeEventListener("visibilitychange",focus);};
  },[id]);
  return id?status:"offline";
}
