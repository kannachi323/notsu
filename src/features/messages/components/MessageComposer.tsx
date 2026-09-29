import { useRef,useState } from "react";
import { useBeforeUnload,useBlocker } from "react-router";
import { messageText,type MessageInput } from "../domain/messages";
import { sendMessage } from "../data/messages";

export function MessageComposer({target,onSent,disabled}:{target:string;onSent:()=>void;disabled:boolean}) {
  const [draft,setDraft]=useState(""),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const attempt=useRef<MessageInput|null>(null),lock=useRef(false);
  const blocker=useBlocker(!!draft||busy);
  useBeforeUnload(event=>{if(draft||busy)event.preventDefault();});
  async function send() {
    if(lock.current||disabled)return;
    try {messageText(draft);} catch(cause){setError((cause as Error).message);return;}
    lock.current=true;setBusy(true);setError("");
    if(attempt.current?.body!==draft)attempt.current={id:crypto.randomUUID(),body:draft};
    try {await sendMessage(target,attempt.current);setDraft("");attempt.current=null;onSent();}
    catch(cause){setError(cause instanceof Error?cause.message:"Delivery could not be confirmed. Retry this message safely.");}
    finally{lock.current=false;setBusy(false);}
  }
  return <form className="message-composer" onSubmit={event=>{event.preventDefault();void send();}}>
    <label htmlFor="message-draft">Message</label><textarea id="message-draft" rows={2} placeholder="Say hello, share a rhythm…" value={draft} disabled={busy||disabled}
      onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if((event.ctrlKey||event.metaKey)&&event.key==="Enter"&&!event.nativeEvent.isComposing){event.preventDefault();void send();}}} />
    <div className="message-compose-footer"><span>{[...draft].length.toLocaleString()} / 2,000 · Ctrl/⌘ + Enter to send</span><button className="account-primary" disabled={busy||disabled||!draft.trim()||[...draft].length>2000}>{busy?"Sending…":error&&attempt.current?.body===draft?"Retry message":"Send message"}</button></div>
    {error&&<p role="alert" className="account-error">{error} Your draft is kept here.</p>}
    {blocker.state==="blocked"&&<div className="account-notice" role="alert"><p>{busy?"This message is still sending. Stay here to see its result.":"Leave this conversation and discard the unsent draft? A message with uncertain delivery may already have arrived."}</p><div className="account-actions"><button type="button" onClick={()=>blocker.reset()}>Stay here</button><button type="button" disabled={busy} onClick={()=>blocker.proceed()}>Discard draft and leave</button></div></div>}
  </form>;
}
