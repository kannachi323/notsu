import { useEffect, useState } from "react";
import { useBeforeUnload, useBlocker } from "react-router";
import { AppScreen } from "../../home/components/AppScreen";
import { Button, ButtonLink, Field, Notice, Page, PageHeader, Panel } from "../../../shared/components";
import { useAccountStore } from "../accountStore";
import { deleteOwnAccount } from "../data/deletion";
import "../accounts.css";

export function DeleteAccountScreen() {
  const identity = useAccountStore(state => state.identity);
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [deleted, setDeleted] = useState(false), [error, setError] = useState("");
  const blocker = useBlocker(busy);
  useEffect(() => { if (blocker.state === "blocked" && !busy) blocker.reset(); }, [blocker, busy]);
  useBeforeUnload(event => { if (busy) { event.preventDefault(); event.returnValue = ""; } });
  async function remove() {
    if (busy) return;
    setBusy(true); setError("");
    const currentPassword = password;
    setPassword("");
    try { await deleteOwnAccount(currentPassword, confirmation); setDeleted(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Deletion could not be confirmed. Try signing in again."); }
    finally { setBusy(false); }
  }
  const retention = "Reviewed reports are retained for 90 days after review; unreviewed reports for 180 days after submission, then scheduled removal.";
  return <AppScreen><Page width="narrow">
    <PageHeader back={{ to: "/account", label: "Your account" }} title={deleted ? "Account deleted" : "Delete your account"} />
    {deleted ? <Panel aria-label="Deletion complete">
      <p role="status">Your account, profile, connections and conversation history have been deleted. Existing report evidence follows the retention period disclosed below.</p>
      <p className="ui-text-muted">Your local maps, drafts, skins and records are still on this device. {retention}</p>
      <div><ButtonLink variant="primary" to="/browse">Continue as a guest</ButtonLink></div>
    </Panel> : !identity ? <Panel aria-label="Sign in required">
      <p>Sign in to the account you want to delete.</p>
      <div><ButtonLink variant="primary" to="/account">Go to sign-in</ButtonLink></div>
    </Panel> : <Panel title="This is permanent" className="account-danger-zone">
      <p className="ui-text-muted">This removes your notsu account, public profile, friendships, blocks and message history from both sides of each conversation. It ends every account session. You cannot undo it.</p>
      <p className="ui-text-muted">Maps, drafts, skins and records saved locally remain on your device.</p>
      <p className="ui-text-muted">Existing reports and captured evidence, including reported messages or profile content, can remain for private review after deletion. {retention}</p>
      <hr className="ui-divider" />
      <p className="account-email">Deleting <strong>{identity.email}</strong></p>
      <form className="ui-form" onSubmit={event => { event.preventDefault(); void remove(); }} aria-busy={busy}><fieldset disabled={busy}>
        <Field label="Current password"><input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></Field>
        <Field label="Type DELETE to confirm"><input autoComplete="off" spellCheck={false} required pattern="DELETE" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></Field>
        <div className="ui-cluster"><Button variant="danger" disabled={confirmation !== "DELETE" || !password} type="submit">{busy ? "Deleting account…" : "Delete my account permanently"}</Button>
          {!busy && <ButtonLink variant="ghost" to="/account">Keep my account</ButtonLink>}</div>
      </fieldset></form>
      {busy && <Notice role="status">Confirming your password and deleting your account. Keep this page open.</Notice>}
      {blocker.state === "blocked" && <Notice tone="warning" role="status">Please wait for the deletion request to finish.</Notice>}
      {error && <Notice tone="danger" role="alert">{error}</Notice>}
    </Panel>}
  </Page></AppScreen>;
}
