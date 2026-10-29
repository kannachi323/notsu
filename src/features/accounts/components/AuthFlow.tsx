import { useEffect, useRef, useState } from "react";
import { accountClient, authError, AccountError } from "../data/auth";
import { emailAddress, emailCode, newPassword } from "../domain/credentials";
import { Button, Field, Notice, Panel } from "../../../shared/components";

type View = "signin" | "signup" | "confirm" | "recover" | "recoveryCode";
const headings: Record<View, string> = { signin: "Sign in", signup: "Create an account", confirm: "Verify your email",
  recover: "Reset your password", recoveryCode: "Enter your recovery code" };

export function AuthFlow() {
  const [view, setView] = useState<View>("signin"), [email, setEmail] = useState("");
  const [password, setPassword] = useState(""), [confirmation, setConfirmation] = useState(""), [code, setCode] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [resendAt, setResendAt] = useState(0), [now, setNow] = useState(Date.now());
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus(); }, [view]);
  useEffect(() => {
    if (!resendAt) return;
    const timer = setInterval(() => {
      const time = Date.now(); setNow(time);
      if (time >= resendAt) setResendAt(0);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendAt]);
  const remaining = Math.max(0, Math.ceil((resendAt - now) / 1000));
  const change = (next: View) => { setView(next); setPassword(""); setConfirmation(""); setCode(""); setError(""); setNotice(""); };
  const waitForEmail = () => { setNow(Date.now()); setResendAt(Date.now() + 60000); };

  async function submit() {
    if (busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const address = emailAddress(email), auth = accountClient().auth;
      if (view === "signin") {
        if (!password) throw new Error("Enter your password.");
        const result = await auth.signInWithPassword({ email: address, password });
        if (result.error) throw authError(result.error);
        setPassword("");
      } else if (view === "signup") {
        const result = await auth.signUp({ email: address, password: newPassword(password, confirmation) });
        if (result.error) throw authError(result.error);
        change("confirm"); waitForEmail();
        setNotice("If this address can be registered, a code is on its way. If you already have an account, sign in.");
      } else if (view === "recover") {
        const result = await auth.resetPasswordForEmail(address);
        if (result.error) throw authError(result.error);
        change("recoveryCode"); waitForEmail();
        setNotice("If an account uses this address, a recovery code is on its way.");
      } else {
        const result = await auth.verifyOtp({ email: address, token: emailCode(code), type: view === "confirm" ? "email" : "recovery" });
        if (result.error) throw authError(result.error);
        setCode("");
      }
    } catch (cause) {
      if (cause instanceof AccountError && cause.code === "email_not_confirmed") {
        change("confirm"); setNotice("Enter your verification code, or request a new one below.");
      } else setError(cause instanceof Error ? cause.message : "Could not complete this request.");
    } finally { setBusy(false); }
  }

  async function resend() {
    if (busy || remaining) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const address = emailAddress(email), auth = accountClient().auth;
      const { error: failure } = view === "confirm" ? await auth.resend({ type: "signup", email: address })
        : await auth.resetPasswordForEmail(address);
      if (failure) throw authError(failure);
      waitForEmail(); setNotice("If this address is eligible, a fresh code is on its way. Check your inbox and spam folder.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not resend the code."); }
    finally { setBusy(false); }
  }

  return <Panel aria-labelledby="account-form-title">
    <div>
      <h2 id="account-form-title" className="ui-panel__title" tabIndex={-1} ref={title}>{headings[view]}</h2>
      <p className="ui-panel__description">{view === "signin" ? "Welcome back to notsu." : view === "signup" ? "Choose a password. We’ll send a code to verify your email." :
        view === "recover" ? "We’ll send a code so you can choose a new password." : "Enter the six-digit code from your email. Codes expire after ten minutes."}</p>
    </div>
    <form className="ui-form" onSubmit={event => { event.preventDefault(); void submit(); }} aria-busy={busy}>
      <fieldset disabled={busy}>
        <Field label="Email"><input type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} /></Field>
        {(view === "signin" || view === "signup") && <Field label="Password" hint={view === "signup" ? "At least 12 characters. A passphrase works well." : undefined}>
          <input type="password" autoComplete={view === "signup" ? "new-password" : "current-password"} minLength={view === "signup" ? 12 : undefined} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} />
        </Field>}
        {view === "signup" && <Field label="Confirm password"><input type="password" autoComplete="new-password" maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></Field>}
        {(view === "confirm" || view === "recoveryCode") && <Field label="Email code"><input className="account-code" inputMode="numeric" autoComplete="one-time-code"
          pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value)} /></Field>}
        {error && <Notice tone="danger" role="alert">{error}</Notice>}
        {notice && <Notice role="status">{notice}</Notice>}
        <Button variant="primary" size="lg" block type="submit">{busy ? "Please wait…" : view === "recover" ? "Send recovery code" :
          view === "confirm" ? "Verify email" : view === "recoveryCode" ? "Continue" : headings[view]}</Button>
      </fieldset>
    </form>
    <div className="ui-cluster">
      {view === "signin" ? <><Button variant="ghost" size="sm" disabled={busy} onClick={() => change("recover")}>Forgot password?</Button><Button variant="ghost" size="sm" disabled={busy} onClick={() => change("signup")}>Create an account</Button>
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => change("confirm")}>Have a verification code?</Button></> : <>
        {(view === "confirm" || view === "recoveryCode") && <Button variant="ghost" size="sm" disabled={busy || remaining > 0} onClick={() => void resend()}>{remaining ? `Resend in ${remaining}s` : "Send a new code"}</Button>}
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => change("signin")}>Back to sign in</Button></>}
    </div>
    <p className="account-session-note">Your session lasts until you close or reload the app. Local play is always available without an account.</p>
  </Panel>;
}
