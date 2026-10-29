import { useState } from "react";
import { Link } from "react-router";
import { AppScreen } from "../../home/components/AppScreen";
import { Avatar, Button, ButtonLink, EmptyState, Icon, List, ListItem, Loading, Notice, Page, PageHeader, SectionHeader, Tabs } from "../../../shared/components";
import { useAccountStore } from "../../accounts/accountStore";
import { configuration } from "../../accounts/data/auth";
import { connectionLists, type ConnectionList } from "../domain/connections";
import { useConnections } from "../useConnections";
import { ConnectionActions } from "./ConnectionActions";
import "../friends.css";
import { useAccountUpdates } from "../../accounts/useAccountUpdates";
import { useFriendPresence } from "../../presence/useFriendPresence";
import { PresenceBadge } from "../../presence/components/PresenceBadge";

const labels: Record<ConnectionList, string> = { friends: "Friends", incoming: "Requests", outgoing: "Sent", blocked: "Blocked" };
const empty: Record<ConnectionList, [string, string]> = {
  friends: ["Find your rhythm together", "Open a player’s profile to send a friend request. Once they accept, they will appear here."],
  incoming: ["No incoming requests", "Friend requests from other players will appear here for you to accept or decline."],
  outgoing: ["No sent requests", "Requests you send will stay here until they are accepted, declined or cancelled."],
  blocked: ["No blocked players", "You can block a player from their profile. Unblocking never restores an old friendship."],
};

export function FriendsScreen() {
  const { identity, profile } = useAccountStore();
  const [list, setList] = useState<ConnectionList>("friends");
  const page = useConnections(list);
  const presence = useFriendPresence(list === "friends" ? page.items.map(item => item.userId) : []);
  const live = useAccountUpdates(() => { page.refresh(); presence.refresh(); });
  const tabs = connectionLists.map(kind => ({ value: kind, label: labels[kind] }));
  return <AppScreen><Page>
    <PageHeader back={{ to: "/", label: "Home" }} icon="friends" title="Your circle" description="Friendships start with a shared beat."
      actions={<ButtonLink to="/players" icon={<Icon name="search" />}>Find a player</ButtonLink>}>
      {configuration && identity && <Tabs label="Connection lists" items={tabs} value={list} onChange={setList} />}
    </PageHeader>
    {!configuration ? <EmptyState title="Online friends are unavailable" description="You can still play, create maps and save local records in this build." /> :
      !identity ? <EmptyState title="Bring your circle together" description="Sign in to send and accept requests, manage friends and block players." action={<ButtonLink variant="primary" to="/account">Sign in</ButtonLink>} /> : <>
        <SectionHeader title={labels[list]} description={<span role="status">{live === "live" ? "Live updates connected" : live === "connecting" ? "Connecting live updates…" : "Live updates unavailable · use Refresh"}</span>}
          actions={<Button size="sm" variant="ghost" icon={<Icon name="refresh" />} disabled={page.busy} onClick={() => { page.refresh(); presence.refresh(); }}>Refresh</Button>} />
        {!profile && <Notice tone="warning"><Link to="/account">Create or load your profile</Link> before sending requests.</Notice>}
        {list === "blocked" && <p className="ui-text-muted ui-text-small">Blocking removes friendships and prevents requests in either direction. Public profiles remain visible.</p>}
        {page.error && <Notice tone="danger" role="alert">{page.error}</Notice>}
        {page.items.length > 0 ? <List label={labels[list]}>{page.items.map(item => <ListItem key={item.id}
          leading={<Avatar name={item.displayName} />}
          title={<Link className="friend-name" to={`/players/${item.username}`}>{item.displayName}</Link>}
          subtitle={`@${item.username}`}
          meta={item.state === "friends" && <PresenceBadge online={presence.get(item.userId)} />}
          actions={<>{item.state === "friends" && <ButtonLink size="sm" variant="primary" to={`/messages/${item.username}`} icon={<Icon name="chat" />}>Message</ButtonLink>}
            <ConnectionActions target={item.userId} connection={{ state: item.state, id: item.id }} onChanged={page.refresh} onRefresh={page.refresh} /></>} />)}
        </List> : !page.busy && !page.error && <EmptyState headingLevel={3} title={empty[list][0]} description={empty[list][1]}
          action={list === "friends" && <ButtonLink variant="primary" to="/players" icon={<Icon name="search" />}>Find a player</ButtonLink>} />}
        {page.busy && <Loading>Loading connections…</Loading>}
        {page.next && <div><Button disabled={page.busy} onClick={page.more}>{page.busy ? "Loading…" : "Load more"}</Button></div>}
      </>}
  </Page></AppScreen>;
}
