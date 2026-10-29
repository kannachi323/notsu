import { useCallback,useEffect,useRef,useState } from "react";
import { Link,useParams } from "react-router";
import { AppScreen } from "../../home/components/AppScreen";
import { Avatar, Badge, Button, ButtonLink, EmptyState, Icon, IconButton, Loading, Notice, Page, PageHeader } from "../../../shared/components";
import { useAccountStore } from "../../accounts/accountStore";
import { configuration } from "../../accounts/data/auth";
import { useAccountUpdates } from "../../accounts/useAccountUpdates";
import { loadInbox } from "../data/messages";
import type { InboxPage } from "../domain/messages";
import type { ConnectionCursor } from "../../friends/domain/connections";
import { ConversationPanel } from "./ConversationPanel";
import "../messages.css";
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
  return <AppScreen><Page width="wide" className="messages-page">
    <PageHeader back={{ to: "/", label: "Home" }} icon="chat" title="Messages" description="A little conversation between beats."
      actions={identity && configuration && <ButtonLink variant="ghost" to="/friends" icon={<Icon name="friends" />}>Manage friends</ButtonLink>} />
    {!configuration ? <EmptyState title="Messages are unavailable in this build" description="Local play and your maps are still available." /> :
      !identity ? <EmptyState title="Stay in rhythm with your friends" description="Sign in to start a private conversation with an accepted friend." action={<ButtonLink variant="primary" to="/account">Sign in</ButtonLink>} /> :
      <div className="messages-layout">
        <aside className="inbox-panel" aria-label="Conversations">
          <header className="inbox-heading"><h2>Conversations</h2><span role="status" className={`messages-live live-${live}`}>{live === "live" ? "Live" : live === "connecting" ? "Connecting…" : "Offline · use Refresh"}</span>
            <IconButton size="sm" label="Refresh conversations" icon={<Icon name="refresh" />} disabled={busy} onClick={refresh} /></header>
          {error && <Notice tone="danger" role="alert">{error}</Notice>}
          <nav className="inbox-list" aria-label="Choose a conversation">{page.items.map(item => <Link key={item.userId} to={`/messages/${item.username}`} aria-current={item.username === username ? "page" : undefined}>
            <Avatar name={item.displayName} /><span className="inbox-copy"><strong>{item.displayName}</strong><span>{item.preview ?? "Say hello"}</span><PresenceBadge online={presence.get(item.userId)} /></span>
            {item.unread > 0 && <Badge tone="accent" aria-label={`${item.unread === 100 ? "100 or more" : item.unread} unread messages`}>{item.unread === 100 ? "99+" : item.unread}</Badge>}
          </Link>)}</nav>
          {busy && <Loading>Loading conversations…</Loading>}
          {!busy && !error && !page.items.length && <p className="ui-text-muted ui-text-small">Accepted friends appear here. <Link to="/friends">Find your circle →</Link></p>}
          {page.next && <Button size="sm" disabled={busy} onClick={() => void load(page.next)}>Load more conversations</Button>}
        </aside>
        {username ? <ConversationPanel key={`${identity}:${username}`} username={username} identity={identity} revision={revision} onChange={refresh} /> :
          <section className="conversation-panel conversation-empty" aria-label="No conversation selected"><EmptyState title="Pick up the conversation"
            description="Choose a friend to start chatting. Messages are private between accepted friends. Blocking stops messages and hides the conversation." /></section>}
      </div>}
  </Page></AppScreen>;
}
