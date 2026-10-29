import { useState } from "react";
import { accountClient, authError, signOut } from "../data/auth";
import { newPassword } from "../domain/credentials";
import { useAccountStore } from "../accountStore";
import { Button, Field, Notice, Panel } from "../../../shared/components";

export function PasswordRecovery() {
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [saved, setSaved] = useState(false);
  async function save() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { error: failure } = await accountClient().auth.updateUser({ password: newPassword(password, confirmation) });
      if (failure) throw authError(failure);
      setPassword(""); setConfirmation(""); setSaved(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not update your password."); }
    finally { setBusy(false); }
  }
  async function cancel() {
    setBusy(true); setError("");
    try { await signOut(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not sign out. Retry when connected."); }
    finally { setBusy(false); }
  }
  return <Panel title={saved ? "Password updated" : "Choose a new password"} description={saved ? undefined : "Your recovery code was verified. Choose a password of at least 12 characters."}>
    {saved ? <><p role="status">Your new password is ready. Use it the next time you sign in.</p><div><Button variant="primary" onClick={() => useAccountStore.setState({ recovery: false })}>Continue to your profile</Button></div></> : <>
      <form className="ui-form" onSubmit={event => { event.preventDefault(); void save(); }} aria-busy={busy}><fieldset disabled={busy}>
        <Field label="New password"><input autoFocus type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></Field>
        <Field label="Confirm new password"><input type="password" autoComplete="new-password" maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></Field>
        {error && <Notice tone="danger" role="alert">{error}</Notice>}
        <Button variant="primary" size="lg" block type="submit">{busy ? "Updating…" : "Update password"}</Button>
      </fieldset></form>
      <div className="ui-cluster"><Button variant="ghost" size="sm" disabled={busy} onClick={() => void cancel()}>Cancel and sign out</Button></div>
    </>}
  </Panel>;
}
