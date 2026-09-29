import { accountClient } from "./auth";
import { useAccountStore } from "../accountStore";

export type LiveStatus="connecting"|"live"|"offline";
/** Hints contain no peer/message data. Every consumer reloads through its API. */
export function watchAccountUpdates(userId:string,onChange:()=>void,onStatus:(status:LiveStatus)=>void) {
  const client=accountClient();
  let stopped=false;
  const active=()=>!stopped && useAccountStore.getState().identity?.id===userId;
  const changed=()=>{if(active())onChange();};
  onStatus("connecting");
  const channel=client.channel(`account:${userId}`,{config:{private:true}})
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"account_updates",filter:`user_id=eq.${userId}`},changed)
    .on("postgres_changes",{event:"UPDATE",schema:"public",table:"account_updates",filter:`user_id=eq.${userId}`},changed)
    .subscribe(status=>{
      if(!active())return;
      onStatus(status==="SUBSCRIBED"?"live":status==="CLOSED"||status==="CHANNEL_ERROR"||status==="TIMED_OUT"?"offline":"connecting");
      if(status==="SUBSCRIBED")changed(); // catch up after initial join/reconnect
    });
  return ()=>{stopped=true;void client.removeChannel(channel);};
}
