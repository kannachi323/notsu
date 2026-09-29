import { useCallback,useEffect,useRef,useState } from "react";
import { Link,useParams } from "react-router";
import { HomeHeader } from "../../home/components/HomeHeader";
import { useAccountStore } from "../../accounts/accountStore";
import { configuration } from "../../accounts/data/auth";
import { useAccountUpdates } from "../../accounts/useAccountUpdates";
import { loadInbox } from "../data/messages";
import type { InboxPage } from "../domain/messages";
import type { ConnectionCursor } from "../../friends/domain/connections";
import { ConversationPanel } from "./ConversationPanel";
import "../../accounts/accounts.css";
import "../messages.css";
import "../../moderation/moderation.css";
import { useFriendPresence } from "../../presence/useFriendPresence";
import { PresenceBadge } from "../../presence/components/PresenceBadge";

export function MessagesScreen(){const id=useAccountStore(state=>state.identity?.id);return <MessagesPage key={id??"guest"} identity={id}/>;}
function MessagesPage({identity}:{identity?:string}) {
  const {username}=useParams(),[page,setPage]=useState<InboxPage>({items:[],next:null}),[error,setError]=useState("");
  const [busy,setBusy]=useState(false),[revision,setRevision]=useState(0),pending=useRef<AbortController|null>(null);
  const load=useCallback(async(cursor:ConnectionCursor|null)=>{
    if(!identity)return;
    pending.current?.abort();const controller=new AbortController();pending.current=controller;setBusy(true);setError("");
    try {const result=await loadInbox(cursor,controller.signal);if(!controller.signal.aborted)setPage(old=>({items:cursor?[...old.items,...result.items.filter(item=>!old.items.some(existing=>existing.userId===item.userId))]:result.items,next:result.next}));}
    catch(cause){if(!controller.signal.aborted){setError(cause instanceof Error?cause.message:"Could not load conversations.");setPage({items:[],next:null});}}
    finally{if(!controller.signal.aborted)setBusy(false);}
  },[identity]);
  const presence=useFriendPresence(page.items.map(item=>item.userId));
  const refresh=()=>{void load(null);presence.refresh();setRevision(value=>value+1);};
  const live=useAccountUpdates(refresh);
  useEffect(()=>{void load(null);return()=>pending.current?.abort();},[load]);
  return <div className="notsu-home account-screen"><HomeHeader/><main className="account-main messages-main">
    <header className="account-heading"><h1>Messages</h1><p>A little conversation between beats.</p></header>
    {!configuration?<section className="account-panel"><h2>Messages are unavailable in this build</h2><p>Local play and your maps are still available.</p></section>:!identity?<section className="account-panel"><h2>Stay in rhythm with your friends</h2><p>Sign in to start a private conversation with an accepted friend.</p><Link className="account-guest" to="/account">Sign in →</Link></section>:<>
      <div className="messages-status"><span role="status" className={`live-${live}`}>{live==="live"?"Live updates connected":live==="connecting"?"Connecting live updates…":"Live updates unavailable · use Refresh"}</span><Link to="/friends">Manage friends →</Link></div>
      <div className="messages-layout"><aside className="inbox-panel" aria-label="Conversations"><header><h2>Your conversations</h2><button disabled={busy} onClick={refresh} aria-label="Refresh conversations">↻</button></header>
        {error&&<p className="account-error" role="alert">{error}</p>}
        <nav aria-label="Choose a conversation">{page.items.map(item=><Link key={item.userId} to={`/messages/${item.username}`} aria-current={item.username===username?"page":undefined}>
          <span className="chat-avatar" aria-hidden="true">{[...item.displayName][0]}</span><span className="inbox-copy"><strong>{item.displayName}</strong><span>{item.preview??"Say hello"}</span><PresenceBadge online={presence.get(item.userId)}/></span>{item.unread>0&&<span className="message-unread" aria-label={`${item.unread===100?"100 or more":item.unread} unread messages`}>{item.unread===100?"99+":item.unread}</span>}
        </Link>)}</nav>
        {busy&&<p role="status">Loading conversations…</p>}{!busy&&!error&&!page.items.length&&<p className="account-muted">Accepted friends appear here. <Link to="/friends">Find your circle →</Link></p>}
        {page.next&&<button disabled={busy} onClick={()=>void load(page.next)}>Load more conversations</button>}
      </aside>{username?<ConversationPanel key={`${identity}:${username}`} username={username} identity={identity} revision={revision} onChange={refresh}/>:<section className="conversation-panel message-welcome"><span aria-hidden="true">◌</span><h2>Pick up the conversation</h2><p>Choose a friend to start chatting.</p><p className="account-muted">Messages are private between accepted friends. Blocking stops messages and hides the conversation.</p></section>}</div>
    </>}
  </main><footer className="notsu-footer">Unofficial community project · Not affiliated with ppy</footer></div>;
}
