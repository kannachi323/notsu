import { useEffect,useLayoutEffect,useRef,useState } from "react";
import { Link } from "react-router";
import { useConversation } from "../useConversation";
import { markRead } from "../data/messages";
import { MessageComposer } from "./MessageComposer";
import { useFriendPresence } from "../../presence/useFriendPresence";
import { PresenceBadge } from "../../presence/components/PresenceBadge";
import { Avatar, Button, EmptyState, Icon, IconButton, Loading, Notice } from "../../../shared/components";

export function ConversationPanel({username,identity,revision,onChange}:{username:string;identity:string;revision:number;onChange:()=>void}) {
  const thread=useConversation(username,revision),scroll=useRef<HTMLDivElement>(null);
  const presence=useFriendPresence(thread.peer?[thread.peer.id]:[],revision);
  const [atBottom,setAtBottom]=useState(true),[readError,setReadError]=useState("");
  const lastRead=useRef(""),olderPosition=useRef<{height:number;top:number}|null>(null),latest=thread.items[0]?.sequence;
  const previousItems=useRef(thread.items);
  useEffect(()=>{
    const element=scroll.current;if(!element)return;
    const observer=new ResizeObserver(()=>{if(atBottom)element.scrollTop=element.scrollHeight;});
    observer.observe(element);return()=>observer.disconnect();
  },[atBottom]);
  useLayoutEffect(()=>{
    const element=scroll.current;if(!element)return;
    const changed=previousItems.current!==thread.items,previousOldest=previousItems.current.at(-1)?.sequence;
    previousItems.current=thread.items;
    if(olderPosition.current!==null&&changed){
      if(previousOldest&&thread.items.at(-1)&&BigInt(thread.items.at(-1)!.sequence)<BigInt(previousOldest))element.scrollTop=olderPosition.current.top+element.scrollHeight-olderPosition.current.height;
      olderPosition.current=null;
    }
    else if(atBottom)element.scrollTop=element.scrollHeight;
  },[thread.items,atBottom]);
  useEffect(()=>{
    if(!thread.peer||!latest||!atBottom||!thread.available)return;
    const peer=thread.peer.id;
    const read=()=>{
      if(document.visibilityState!=="visible"||lastRead.current===latest)return;
      lastRead.current=latest;
      void markRead(peer,latest).then(()=>setReadError("")).catch(()=>{lastRead.current="";setReadError("Unread status could not sync. Refresh to retry.");});
    };
    read();document.addEventListener("visibilitychange",read);
    return()=>document.removeEventListener("visibilitychange",read);
  },[thread.peer?.id,latest,atBottom,thread.available,revision]);
  return <section className="conversation-panel" aria-label={`Conversation with ${thread.peer?.displayName??username}`}>
    <header className="conversation-heading">
      <Avatar name={thread.peer?.displayName??username} />
      <div><h2>{thread.peer?.displayName??username}</h2><div className="ui-cluster"><Link to={`/players/${username}`}>@{username} · View profile</Link><PresenceBadge online={thread.peer?presence.get(thread.peer.id):null}/></div></div>
      <IconButton size="sm" label="Refresh conversation" icon={<Icon name="refresh" />} disabled={thread.busy} onClick={()=>{thread.refresh();presence.refresh();}} />
    </header>
    {thread.error&&<Notice tone="danger" role="alert">{thread.error}</Notice>}
    <div className="message-history" ref={scroll} role="region" aria-label="Message history" tabIndex={0} onScroll={()=>{const el=scroll.current;if(el)setAtBottom(el.scrollHeight-el.scrollTop-el.clientHeight<48);}}>
      {thread.next&&<Button size="sm" variant="ghost" className="message-older" disabled={thread.busy} onClick={()=>{if(scroll.current)olderPosition.current={height:scroll.current.scrollHeight,top:scroll.current.scrollTop};setAtBottom(false);thread.older();}}>Load earlier messages</Button>}
      {!thread.items.length&&!thread.busy&&!thread.error&&<div className="message-welcome"><EmptyState headingLevel={3} title="A new conversation" description="Talk maps, compare patterns, or just say hello." /></div>}
      <ol aria-label="Messages">{[...thread.items].reverse().map(message=><li key={message.sequence} className={message.senderId===identity?"message-own":"message-peer"}>
        <div className="message-bubble"><p>{message.body}</p><time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString()}>{new Date(message.createdAt).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}</time>{message.senderId!==identity && <Link className="report-message-link" to={`/report/${message.senderId}/${message.id}`}>Report message</Link>}</div>
      </li>)}</ol>
      {thread.busy&&<Loading>Loading messages…</Loading>}
    </div>
    {!atBottom&&thread.items.length>0&&<Button size="sm" className="message-latest" onClick={()=>setAtBottom(true)}>Jump to latest ↓</Button>}
    {readError&&<p role="status" className="ui-text-muted ui-text-small">{readError}</p>}
    {thread.peer&&<MessageComposer target={thread.peer.id} disabled={!thread.available} onSent={()=>{setAtBottom(true);onChange();}}/>}
  </section>;
}
