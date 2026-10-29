import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAccountStore } from "../../accounts/accountStore";
import { getConnection } from "../data/connections";
import type { Connection } from "../domain/connections";
import { ConnectionActions } from "./ConnectionActions";
import "../friends.css";
import { Button, ButtonLink, Icon, Loading, Notice } from "../../../shared/components";
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
  if (!identity) return <p className="ui-text-muted"><Link to="/account">Sign in</Link> to connect with this player.</p>;
  if (identity.id === target) return <div><ButtonLink size="sm" to="/friends" icon={<Icon name="friends" />}>Your friends</ButtonLink></div>;
  if (!profile) return <p className="ui-text-muted"><Link to="/account">Create or load your profile</Link> to connect with this player.</p>;
  return <section className="profile-connection" aria-label="Player connection">
    {connection?.state==="friends" && <div className="ui-cluster"><PresenceBadge online={presence.get(target)}/><ButtonLink size="sm" variant="primary" to={`/messages/${username}`} icon={<Icon name="chat" />}>Message</ButtonLink></div>}
    {error ? <Notice tone="danger" role="alert" actions={<Button size="sm" onClick={() => setRevision(value => value + 1)}>Retry connection</Button>}>{error}</Notice> :
      connection ? <ConnectionActions key={`${identity.id}:${target}`} target={target} connection={connection} onChanged={setConnection} onRefresh={() => setRevision(value => value + 1)} /> : <Loading>Loading connection…</Loading>}
    <Link className="profile-report" to={`/report/${target}`}><Icon name="flag" />Report player</Link>
  </section>;
}
