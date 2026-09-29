import { useEffect, useState } from "react";
import { Link } from "react-router";
import { HomeHeader } from "../../home/components/HomeHeader";
import { useAccountStore } from "../accountStore";
import { accountClient, configuration, signOut } from "../data/auth";
import { loadOwnProfile } from "../data/profiles";
import { AuthFlow } from "./AuthFlow";
import { ProfileEditor } from "./ProfileEditor";
import { PasswordRecovery } from "./PasswordRecovery";
import "../accounts.css";
import { PresenceSettings } from "../../presence/components/PresenceSettings";
import { useModerationAccess } from "../../moderation/useModerationAccess";
import { CommunityAccess } from "../../moderation/components/CommunityAccess";
import "../../moderation/moderation.css";

export function AccountScreen() {
  const { identity, profile, profileStatus, profileError, recovery, profileDirty, profileSaving } = useAccountStore();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [confirmLeave, setConfirmLeave] = useState(false);
  const access = useModerationAccess();
  useEffect(() => { if (configuration) accountClient(); }, []);
  useEffect(() => { if (identity) void loadOwnProfile(); }, [identity?.id]); // Refresh after a different account signs in.
  async function leave(discard = false) {
    if (profileSaving) return;
    if (profileDirty && !discard) { setConfirmLeave(true); return; }
    setConfirmLeave(false);
    setBusy(true); setError("");
    try { await signOut(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not sign out. Try again."); }
    finally { setBusy(false); }
  }
  return <div className="notsu-home account-screen"><HomeHeader /><main className="account-main">
    <header className="account-heading"><Link to="/">← Home</Link><h1>Your account</h1><p>Manage your profile and sign-in.</p></header>
    <div className="account-columns"><aside className="account-summary">
      <div className="account-orbit" aria-hidden="true"><i /><span>{profile ? [...profile.displayName][0]?.toUpperCase() : "n"}</span></div>
      <h2>{profile?.displayName || (identity ? "Welcome to notsu" : "Play as a guest")}</h2>
      {profile ? <><p className="account-handle">@{profile.username}</p>{profile.bio && <p className="account-bio">{profile.bio}</p>}</> : <p className="account-muted">Local maps and the editor are yours to explore, with or without an account.</p>}
      <div className="account-profile-links">{profile && <Link className="account-guest" to={`/players/${profile.username}`}>View public profile →</Link>}<Link className="account-guest" to="/players">Find a player →</Link></div>
      <Link className="account-guest" to="/browse">Browse local maps <span aria-hidden="true">↗</span></Link>
      {identity && <div className="account-identity"><p>Signed in as<br /><strong>{identity.email}</strong></p>
        <button disabled={busy || profileSaving} onClick={() => void leave()}>{busy ? "Signing out…" : "Sign out"}</button>
        {confirmLeave && profileDirty && <div className="account-notice"><p>Discard your unsaved profile changes and sign out?</p><div className="account-actions"><button disabled={busy || profileSaving} onClick={() => void leave(true)}>Discard and sign out</button><button onClick={() => setConfirmLeave(false)}>Keep editing</button></div></div>}
        {error && <p role="alert" className="account-error">{error}</p>}
        {!recovery && <Link className="account-delete-link" to="/account/delete">Delete account</Link>}</div>}
    </aside>
      {!configuration ? <section className="account-panel"><h2>Local play is ready</h2><p>Online accounts are unavailable in this build. You can play, create maps and save local records.</p><Link className="account-guest" to="/rhythm">Start playing →</Link></section> :
        !identity ? <AuthFlow /> : recovery ? <PasswordRecovery /> : profileStatus === "ready" ? <ProfileEditor key={identity.id} profile={profile} restricted={!!access.value?.restriction} /> :
        <section className="account-panel"><h2>Your profile</h2>{profileStatus === "error" ? <><p className="account-error" role="alert">{profileError}</p><button onClick={() => void loadOwnProfile()}>Retry loading profile</button></> : <p role="status">Loading your profile…</p>}</section>}
    </div>
    {identity && profile && !recovery && <PresenceSettings />}
    {identity && !recovery && <CommunityAccess access={access}/>}
  </main><footer className="notsu-footer">Unofficial community project · Not affiliated with ppy</footer></div>;
}
