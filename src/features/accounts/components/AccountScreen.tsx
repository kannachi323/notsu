import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AppScreen } from "../../home/components/AppScreen";
import { Avatar, Button, ButtonLink, Icon, Loading, Notice, Page, PageHeader, Panel } from "../../../shared/components";
import { useAccountStore } from "../accountStore";
import { accountClient, configuration, configurationIssue, signOut } from "../data/auth";
import { loadOwnProfile } from "../data/profiles";
import { AuthFlow } from "./AuthFlow";
import { ProfileEditor } from "./ProfileEditor";
import { PasswordRecovery } from "./PasswordRecovery";
import "../accounts.css";
import { PresenceSettings } from "../../presence/components/PresenceSettings";
import { useModerationAccess } from "../../moderation/useModerationAccess";
import { CommunityAccess } from "../../moderation/components/CommunityAccess";

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
  return <AppScreen><Page>
    <PageHeader back={{ to: "/", label: "Home" }} icon="profile" title="Your account" description="Manage your profile and sign-in." />
    <div className="ui-columns ui-columns--sidebar">
      <aside className="ui-stack">
        <Panel aria-label="Profile summary" className="account-summary">
          <Avatar name={profile?.displayName || "notsu"} size="xl" />
          <div className="ui-stack ui-stack--sm">
            <h2 className="account-name">{profile?.displayName || (identity ? "Welcome to notsu" : "Play as a guest")}</h2>
            {profile ? <><p className="account-handle">@{profile.username}</p>{profile.bio && <p className="ui-prose">{profile.bio}</p>}</> : <p className="ui-text-muted">Local maps and the editor are yours to explore, with or without an account.</p>}
          </div>
          <nav className="account-links" aria-label="Profile links">
            {profile && <Link className="ui-link" to={`/players/${profile.username}`}>View public profile →</Link>}
            <Link className="ui-link" to="/players">Find a player →</Link>
            <Link className="ui-link" to="/browse">Browse local maps ↗</Link>
          </nav>
        </Panel>
        {identity && <Panel aria-label="Sign-in" className="account-identity">
          <p className="ui-text-muted ui-text-small">Signed in as<br /><strong className="account-email">{identity.email}</strong></p>
          <Button variant="outline" disabled={busy || profileSaving} onClick={() => void leave()}>{busy ? "Signing out…" : "Sign out"}</Button>
          {confirmLeave && profileDirty && <Notice tone="warning" title="Discard your unsaved profile changes and sign out?" actions={<>
            <Button size="sm" variant="danger" disabled={busy || profileSaving} onClick={() => void leave(true)}>Discard and sign out</Button>
            <Button size="sm" onClick={() => setConfirmLeave(false)}>Keep editing</Button></>} />}
          {error && <Notice tone="danger" role="alert">{error}</Notice>}
          {!recovery && <Link className="account-delete-link" to="/account/delete">Delete account</Link>}
        </Panel>}
      </aside>
      <div className="ui-stack ui-stack--lg">
        {!configuration ? <Panel title="Local play is ready">
          <p className="ui-text-muted">{configurationIssue || "Online accounts are unavailable in this build. You can play, create maps and save local records."}</p>
          <div><ButtonLink variant="primary" to="/rhythm">Start playing</ButtonLink></div>
        </Panel> :
          !identity ? <AuthFlow /> : recovery ? <PasswordRecovery /> : profileStatus === "ready" ? <ProfileEditor key={identity.id} profile={profile} restricted={!!access.value?.restriction} /> :
          <Panel title="Your profile">{profileStatus === "error" ? <>
            <Notice tone="danger" role="alert">{profileError}</Notice>
            <div><Button icon={<Icon name="refresh" />} onClick={() => void loadOwnProfile()}>Retry loading profile</Button></div>
          </> : <Loading>Loading your profile…</Loading>}</Panel>}
        {identity && profile && !recovery && <PresenceSettings />}
        {identity && !recovery && <CommunityAccess access={access} />}
      </div>
    </div>
  </Page></AppScreen>;
}
