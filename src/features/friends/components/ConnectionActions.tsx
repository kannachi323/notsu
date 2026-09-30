import { useState } from "react";
import { changeConnection } from "../data/connections";
import type { Connection, ConnectionAction } from "../domain/connections";

const labels: Record<Connection["state"], string> = { none: "Connect with this player", outgoing: "Friend request sent", incoming: "Wants to be your friend",
  friends: "You are friends", blocked: "Player blocked", unavailable: "This connection is unavailable", self: "Your profile" };

export function ConnectionActions({ target, connection, onChanged, onRefresh }: {
  target: string; connection: Connection; onChanged: (value: Connection) => void; onRefresh: () => void;
}) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [confirm, setConfirm] = useState<"block" | "remove" | null>(null);
  async function change(action: ConnectionAction) {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await changeConnection(target, action === "send" || action === "block"
        ? { action } : { action, expectedId: connection.id! });
      setConfirm(null); onChanged(result);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not confirm this change. Please refresh."); }
    finally { setBusy(false); }
  }
  const action = (label: string, value: ConnectionAction, primary = false) =>
    <button disabled={busy} className={primary ? "account-primary" : undefined} onClick={() => void change(value)}>{label}</button>;
  return <div className="connection-actions" aria-busy={busy}>
    <p className="connection-state" role="status">{busy ? "Updating connection…" : labels[connection.state]}</p>
    {confirm ? <div className="connection-confirm"><p>{confirm === "block"
      ? "Blocking ends your friendship, cancels pending requests and stops messages between you. Conversation history is hidden while you are not friends. Public profiles stay visible."
      : "Remove this friendship? You can send a new request later."}</p><div className="account-actions">
        {action(confirm === "block" ? "Block player" : "Remove friend", confirm)}<button disabled={busy} onClick={() => setConfirm(null)}>Cancel</button>
      </div></div> : <div className="account-actions">
        {connection.state === "none" && action("Add friend", "send", true)}
        {connection.state === "incoming" && <>{action("Accept request", "accept", true)}{action("Decline", "decline")}</>}
        {connection.state === "outgoing" && action("Cancel request", "cancel")}
        {connection.state === "friends" && <button disabled={busy} onClick={() => setConfirm("remove")}>Remove friend</button>}
        {connection.state === "blocked" && action("Unblock", "unblock")}
        {!["self", "blocked"].includes(connection.state) && <button disabled={busy} className="connection-block" onClick={() => setConfirm("block")}>Block</button>}
      </div>}
    {error && <div className="account-error" role="alert"><p>{error}</p><button disabled={busy} onClick={() => { setError(""); setConfirm(null); onRefresh(); }}>Refresh connection</button></div>}
  </div>;
}
