import { useCallback,useEffect,useRef,useState } from "react";
import { AccountError } from "../accounts/data/auth";
import { loadPublicProfile } from "../accounts/data/publicProfiles";
import type { Profile } from "../accounts/domain/profile";
import { loadMessages } from "./data/messages";
import { mergeMessagePage,type MessagePage } from "./domain/messages";

export function useConversation(username:string,revision:number) {
  const [peer,setPeer]=useState<Profile|null>(null),[page,setPage]=useState<MessagePage>({items:[],next:null});
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[available,setAvailable]=useState(false);
  const pending=useRef<AbortController|null>(null);
  const load=useCallback(async(before:string|null)=>{
    pending.current?.abort();const controller=new AbortController();pending.current=controller;
    setBusy(true);setError("");
    try {
      const profile=await loadPublicProfile(username,controller.signal);
      if(controller.signal.aborted)return;
      setPeer(profile);
      const page=await loadMessages(profile.id,before,controller.signal);
      if(controller.signal.aborted)return;
      setAvailable(true);
      setPage(old=>mergeMessagePage(old,page,!!before));
    } catch(cause) {
      if(controller.signal.aborted)return;
      setError(cause instanceof Error?cause.message:"Could not load messages.");
      if(cause instanceof AccountError && ["conversation_unavailable","account_unavailable","sign_in_required","not_found"].includes(cause.code)) {
        setPage({items:[],next:null});setAvailable(false);
      }
    } finally {if(!controller.signal.aborted)setBusy(false);}
  },[username]);
  useEffect(()=>{void load(null);return()=>pending.current?.abort();},[load,revision]);
  return {peer,...page,busy,error,available,refresh:()=>void load(null),older:()=>{if(!busy&&page.next)void load(page.next);}};
}
