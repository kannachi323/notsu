import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAccountStore } from "../../accounts/accountStore";
import { getConnection } from "../data/connections";
import type { Connection } from "../domain/connections";
import { ConnectionActions } from "./ConnectionActions";
import "../friends.css";
import { useAccountUpdates } from "../../accounts/useAccountUpdates";
import { useFriendPresence } from "../../presence/useFriendPresence";
import { PresenceBadge } from "../../presence/components/PresenceBadge";

export function ProfileConnection({ target,username }: { target: string;username:string }) {
  const { identity, profile } = useAccountStore();
  const [connection, setConnection] = useState<Connection | null>(null), [error, setError] = useState(""), [revision, setRevision] = useState(0);
  useAccountUpdates(()=>setRevision(value=>value+1));
  const presence=useFriendPresence(connection?.state==="friends"?[target]:[],revision);
  useEffect(() => {
    // The parent keys by identity/target. Keep controls mounted during live
    // refreshes so an incoming hint cannot dismiss a block confirmation.
    setError("");
    if (!identity || identity.id === target) return;
    const controller = new AbortController();
    void getConnection(target, controller.signal).then(value => { if (!controller.signal.aborted) setConnection(value); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load connection."); });
    return () => controller.abort();
  }, [identity?.id, target, revision]);
  if (!identity) return <p className="connection-sign-in"><Link to="/account">Sign in</Link> to connect with this player.</p>;
  if (identity.id === target) return <Link className="account-guest" to="/friends">Your friends →</Link>;
  if (!profile) return <p className="connection-sign-in"><Link to="/account">Create or load your profile</Link> to connect with this player.</p>;
  return <section className="profile-connection" aria-label="Player connection">
    {connection?.state==="friends" && <PresenceBadge online={presence.get(target)}/>}
    {connection?.state==="friends" && <Link className="account-guest" to={`/messages/${username}`}>Message →</Link>}
    {error ? <><p role="alert" className="account-error">{error}</p><button onClick={() => setRevision(value => value + 1)}>Retry connection</button></> :
      connection ? <ConnectionActions key={`${identity.id}:${target}`} target={target} connection={connection} onChanged={setConnection} onRefresh={() => setRevision(value => value + 1)} /> : <p role="status">Loading connection…</p>}
  </section>;
}
