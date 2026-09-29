import { useEffect, useRef, useState } from "react";
import { accountClient, authError, AccountError } from "../data/auth";
import { emailAddress, emailCode, newPassword } from "../domain/credentials";

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

  return <section className="account-panel" aria-labelledby="account-form-title">
    <h2 id="account-form-title" tabIndex={-1} ref={title}>{headings[view]}</h2>
    <p className="account-muted">{view === "signin" ? "Welcome back to notsu." : view === "signup" ? "Choose a password. We’ll send a code to verify your email." :
      view === "recover" ? "We’ll send a code so you can choose a new password." : "Enter the six-digit code from your email. Codes expire after ten minutes."}</p>
    <form onSubmit={event => { event.preventDefault(); void submit(); }} aria-busy={busy}>
      <fieldset disabled={busy}>
        <label>Email<input type="email" autoComplete="email" maxLength={254} required value={email} onChange={event => setEmail(event.target.value)} /></label>
        {(view === "signin" || view === "signup") && <label>Password<input type="password" autoComplete={view === "signup" ? "new-password" : "current-password"}
          minLength={view === "signup" ? 12 : undefined} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} />
          {view === "signup" && <span className="account-hint">At least 12 characters. A passphrase works well.</span>}</label>}
        {view === "signup" && <label>Confirm password<input type="password" autoComplete="new-password" maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>}
        {(view === "confirm" || view === "recoveryCode") && <label>Email code<input className="account-code" inputMode="numeric" autoComplete="one-time-code"
          pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value)} /></label>}
        {error && <p className="account-error" role="alert">{error}</p>}
        {notice && <p className="account-notice" role="status">{notice}</p>}
        <button className="account-primary" type="submit">{busy ? "Please wait…" : view === "recover" ? "Send recovery code" :
          view === "confirm" ? "Verify email" : view === "recoveryCode" ? "Continue" : headings[view]}</button>
      </fieldset>
    </form>
    <div className="account-form-links">
      {view === "signin" ? <><button disabled={busy} onClick={() => change("recover")}>Forgot password?</button><button disabled={busy} onClick={() => change("signup")}>Create an account</button>
        <button disabled={busy} onClick={() => change("confirm")}>Have a verification code?</button></> : <>
        {(view === "confirm" || view === "recoveryCode") && <button disabled={busy || remaining > 0} onClick={() => void resend()}>{remaining ? `Resend in ${remaining}s` : "Send a new code"}</button>}
        <button disabled={busy} onClick={() => change("signin")}>Back to sign in</button></>}
    </div>
    <p className="account-session-note">Your session lasts until you close or reload the app. Local play is always available without an account.</p>
  </section>;
}
