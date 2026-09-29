import { useEffect, useState } from "react";
import { Link, useBeforeUnload, useBlocker } from "react-router";
import { HomeHeader } from "../../home/components/HomeHeader";
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
  return <div className="notsu-home account-screen"><HomeHeader /><main className="account-main account-narrow">
    <header className="account-heading"><Link to="/account">← Your account</Link><h1>{deleted ? "Account deleted" : "Delete your account"}</h1></header>
    <section className="account-panel">
      {deleted ? <><p role="status">Your account, profile, connections and message history have been permanently deleted.</p><p className="account-muted">Your local maps, drafts, skins and records are still on this device.</p><Link className="account-guest" to="/browse">Continue as a guest →</Link></> :
        !identity ? <><p>Sign in to the account you want to delete.</p><Link className="account-guest" to="/account">Go to sign-in →</Link></> : <>
          <h2>This is permanent</h2><p className="account-muted">This removes your notsu account, public profile, friendships, blocks and message history from both sides of each conversation. It ends every account session. You cannot undo it.</p>
          <p className="account-muted">Maps, drafts, skins and records saved locally remain on your device.</p>
          <p className="account-delete-identity">Deleting <strong>{identity.email}</strong></p>
          <form onSubmit={event => { event.preventDefault(); void remove(); }} aria-busy={busy}><fieldset disabled={busy}>
            <label>Current password<input type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} /></label>
            <label>Type DELETE to confirm<input autoComplete="off" spellCheck={false} required pattern="DELETE" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
            <div className="account-actions"><button className="account-danger" disabled={confirmation !== "DELETE" || !password} type="submit">{busy ? "Deleting account…" : "Delete my account permanently"}</button></div>
          </fieldset></form>
          {busy && <p role="status" className="account-notice">Confirming your password and deleting your account. Keep this page open.</p>}
          {blocker.state === "blocked" && <p role="status">Please wait for the deletion request to finish.</p>}
          {error && <p role="alert" className="account-error">{error}</p>}
          {!busy && <Link className="account-guest" to="/account">Keep my account</Link>}
        </>}
    </section>
  </main><footer className="notsu-footer">Unofficial community project · Not affiliated with ppy</footer></div>;
}
