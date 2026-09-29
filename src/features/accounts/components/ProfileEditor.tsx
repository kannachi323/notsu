import { useEffect, useState } from "react";
import { useBeforeUnload, useBlocker } from "react-router";
import type { Profile, ProfileInput } from "../domain/profile";
import { saveOwnProfile } from "../data/profiles";
import { useAccountStore } from "../accountStore";

const editable = (profile: Profile | null): ProfileInput => ({ username: profile?.username ?? "", displayName: profile?.displayName ?? "", bio: profile?.bio ?? "" });

export function ProfileEditor({ profile, restricted = false }: { profile: Profile | null; restricted?: boolean }) {
  const [input, setInput] = useState(() => editable(profile)), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [saved, setSaved] = useState(false);
  const dirty = JSON.stringify(input) !== JSON.stringify(editable(profile));
  const blocker = useBlocker(dirty);
  useEffect(() => {
    useAccountStore.setState({ profileDirty: dirty, profileSaving: busy });
    return () => { useAccountStore.setState({ profileDirty: false, profileSaving: false }); };
  }, [dirty, busy]);
  useBeforeUnload(event => { if (dirty) { event.preventDefault(); event.returnValue = ""; } });
  const change = (key: keyof ProfileInput, value: string) => { setInput({ ...input, [key]: value }); setSaved(false); };
  async function save() {
    if (busy || restricted) return;
    setBusy(true); setError(""); setSaved(false);
    try { const result = await saveOwnProfile(input); setInput(editable(result)); setSaved(true); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save your profile."); }
    finally { setBusy(false); }
  }
  return <section className="account-panel"><h2>{profile ? "Edit your profile" : "Create your profile"}</h2>
    <p className="account-muted">Your username, display name and bio are public. Your email stays private.</p>
    {restricted && <p role="status" className="account-notice">Profile edits are unavailable during your community restriction. See the Community panel below.</p>}
    <form onSubmit={event => { event.preventDefault(); void save(); }} aria-busy={busy}><fieldset disabled={busy || restricted}>
      <label>Username<input autoComplete="username" required minLength={3} maxLength={20} pattern="[A-Za-z][A-Za-z0-9_]{2,19}" value={input.username} onChange={event => change("username", event.target.value)} />
        <span className="account-hint">3–20 letters, numbers or underscores. Start with a letter.</span></label>
      <label>Display name<input autoComplete="nickname" required maxLength={80} value={input.displayName} onChange={event => change("displayName", event.target.value)} /></label>
      <label>Bio<textarea rows={4} maxLength={560} value={input.bio} onChange={event => change("bio", event.target.value)} /><span className="account-hint">{[...input.bio.trim()].length} / 280 characters</span></label>
      {error && <p className="account-error" role="alert">{error}</p>}{saved && <p className="account-notice" role="status">Profile saved.</p>}
      <div className="account-actions"><button className="account-primary" disabled={!dirty && !!profile} type="submit">{busy ? "Saving…" : "Save profile"}</button>
        {dirty && <button type="button" onClick={() => { setInput(editable(profile)); setError(""); }}>Discard changes</button>}</div>
    </fieldset></form>
    {blocker.state === "blocked" && <div className="account-notice" role="alert"><p>{busy ? "Your profile is saving. Wait before leaving." : dirty ? "Leave without saving your profile changes?" : "Your profile is saved. Ready to leave?"}</p>
      <div className="account-actions"><button disabled={busy} onClick={() => blocker.reset()}>Keep editing</button><button disabled={busy} onClick={() => blocker.proceed()}>{dirty ? "Discard and leave" : "Leave"}</button></div></div>}
  </section>;
}
