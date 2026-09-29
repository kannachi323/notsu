import { useState } from "react";
import { Link } from "react-router";
import { HomeHeader } from "../../home/components/HomeHeader";
import { useAccountStore } from "../../accounts/accountStore";
import { configuration } from "../../accounts/data/auth";
import { connectionLists, type ConnectionList } from "../domain/connections";
import { useConnections } from "../useConnections";
import { ConnectionActions } from "./ConnectionActions";
import "../../accounts/accounts.css";
import "../friends.css";
import { useAccountUpdates } from "../../accounts/useAccountUpdates";

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
  const live = useAccountUpdates(page.refresh);
  return <div className="notsu-home account-screen"><HomeHeader /><main className="account-main friends-main">
    <header className="account-heading"><Link to="/">← Home</Link><div className="friends-heading"><div><h1>Your circle</h1><p>Friendships start with a shared beat.</p></div><Link className="account-guest" to="/players">Find a player →</Link></div></header>
    {!configuration ? <section className="account-panel"><h2>Online friends are unavailable</h2><p className="account-muted">You can still play, create maps and save local records in this build.</p></section> :
      !identity ? <section className="account-panel friends-empty"><h2>Bring your circle together</h2><p className="account-muted">Sign in to send and accept requests, manage friends and block players.</p><Link className="account-guest" to="/account">Sign in →</Link></section> :
        <><nav className="friends-tabs" aria-label="Connection lists">{connectionLists.map(kind => <button key={kind} aria-pressed={list === kind} onClick={() => setList(kind)}>{labels[kind]}</button>)}</nav>
          <div className="friends-list-heading"><h2>{labels[list]}</h2><button disabled={page.busy} onClick={page.refresh}>Refresh</button></div>
          <p className="account-muted" role="status">{live === "live" ? "Live updates connected" : live === "connecting" ? "Connecting live updates…" : "Live updates unavailable · use Refresh"}</p>
          {!profile && <p className="account-notice"><Link to="/account">Create or load your profile</Link> before sending requests.</p>}
          {list === "blocked" && <p className="account-muted">Blocking removes friendships and prevents requests in either direction. Public profiles remain visible.</p>}
          {page.error && <p className="account-error" role="alert">{page.error}</p>}
          {page.items.length > 0 ? <ul className="friends-list">{page.items.map(item => <li key={item.id}>
            <Link className="friend-identity" to={`/players/${item.username}`}><span className="friend-initial" aria-hidden="true">{[...item.displayName][0]?.toUpperCase()}</span><span><strong>{item.displayName}</strong><span>@{item.username}</span></span></Link>
            <div>{item.state === "friends" && <Link className="account-guest" to={`/messages/${item.username}`}>Message →</Link>}<ConnectionActions target={item.userId} connection={{ state: item.state, id: item.id }} onChanged={page.refresh} onRefresh={page.refresh} /></div>
          </li>)}</ul> : !page.busy && !page.error && <section className="account-panel friends-empty"><div className="friends-empty-orbits" aria-hidden="true"><i /><i /><i /></div><h3>{empty[list][0]}</h3><p>{empty[list][1]}</p>{list === "friends" && <Link className="account-guest" to="/players">Find a player →</Link>}</section>}
          {page.busy && <p role="status">Loading connections…</p>}
          {page.next && <button disabled={page.busy} onClick={page.more}>{page.busy ? "Loading…" : "Load more"}</button>}
        </>}
  </main><footer className="notsu-footer">Unofficial community project · Not affiliated with ppy</footer></div>;
}
