import { useState } from "react";
import { changeConnection } from "../data/connections";
import type { Connection, ConnectionAction } from "../domain/connections";
import { Button, Notice, type ButtonVariant } from "../../../shared/components";

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
  const action = (label: string, value: ConnectionAction, variant: ButtonVariant = "secondary") =>
    <Button size="sm" variant={variant} disabled={busy} onClick={() => void change(value)}>{label}</Button>;
  return <div className="connection-actions" aria-busy={busy}>
    <p className="connection-state" role="status">{busy ? "Updating connection…" : labels[connection.state]}</p>
    {confirm ? <Notice tone="warning" title={confirm === "block" ? "Block this player?" : "Remove this friendship?"} actions={<>
      {action(confirm === "block" ? "Block player" : "Remove friend", confirm, "danger")}<Button size="sm" disabled={busy} onClick={() => setConfirm(null)}>Cancel</Button></>}>
      {confirm === "block"
        ? "Blocking ends your friendship, cancels pending requests and stops messages between you. Conversation history is hidden while you are not friends. Public profiles stay visible."
        : "You can send a new request later."}
    </Notice> : <div className="ui-cluster">
        {connection.state === "none" && action("Add friend", "send", "primary")}
        {connection.state === "incoming" && <>{action("Accept request", "accept", "primary")}{action("Decline", "decline")}</>}
        {connection.state === "outgoing" && action("Cancel request", "cancel")}
        {connection.state === "friends" && <Button size="sm" disabled={busy} onClick={() => setConfirm("remove")}>Remove friend</Button>}
        {connection.state === "blocked" && action("Unblock", "unblock")}
        {!["self", "blocked"].includes(connection.state) && <Button size="sm" variant="ghost" className="connection-block" disabled={busy} onClick={() => setConfirm("block")}>Block</Button>}
      </div>}
    {error && <Notice tone="danger" role="alert" actions={<Button size="sm" disabled={busy} onClick={() => { setError(""); setConfirm(null); onRefresh(); }}>Refresh connection</Button>}>{error}</Notice>}
  </div>;
}
