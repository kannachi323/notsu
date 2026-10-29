import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { AppScreen } from "../../home/components/AppScreen";
import { Avatar, Badge, Button, ButtonLink, EmptyState, Field, Icon, Loading, Page, PageHeader, Panel } from "../../../shared/components";
import { useAccountStore } from "../accountStore";
import { AccountError } from "../data/auth";
import { loadPublicProfile } from "../data/publicProfiles";
import { parseUsername, type Profile } from "../domain/profile";
import "../accounts.css";
import { ProfileConnection } from "../../friends/components/ProfileConnection";

export function PublicProfileScreen() {
  const { username } = useParams();
  return <PlayerPage key={username ?? "search"} username={username} />;
}

function PlayerPage({ username }: { username?: string }) {
  const navigate = useNavigate(), identity = useAccountStore(state => state.identity);
  const [query, setQuery] = useState(username ?? ""), [queryError, setQueryError] = useState("");
  const [profile, setProfile] = useState<Profile | null>(null), [error, setError] = useState("");
  const [loading, setLoading] = useState(!!username), [missing, setMissing] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!username) return;
    const controller = new AbortController();
    setLoading(true); setError(""); setMissing(false); setProfile(null);
    void loadPublicProfile(username, controller.signal).then(result => {
      if (!controller.signal.aborted) setProfile(result);
    }).catch(cause => {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "Could not load this profile.");
      setMissing(cause instanceof AccountError && cause.code === "not_found");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [username, retry]);
  function search() {
    try {
      const handle = parseUsername(query.startsWith("@") ? query.slice(1) : query);
      setQueryError("");
      if (handle === username) setRetry(value => value + 1);
      else navigate(`/players/${handle}`);
    } catch (cause) { setQueryError(cause instanceof Error ? cause.message : "Enter a username."); }
  }
  const joined = profile ? new Date(profile.createdAt) : null;
  return <AppScreen><Page>
    <PageHeader back={{ to: "/", label: "Home" }} icon="search" title="Players" description="Find a player by their exact username." />
    <form className="player-search" role="search" onSubmit={event => { event.preventDefault(); search(); }}>
      <Field label="Player username" error={queryError || undefined}><input autoComplete="off" spellCheck={false} required maxLength={21} placeholder="@username" value={query} onChange={event => setQuery(event.target.value)} /></Field>
      <Button variant="primary" size="lg" type="submit" icon={<Icon name="search" />}>Find player</Button>
    </form>
    {loading ? <Loading>Loading player…</Loading> : error ? <EmptyState title={missing ? "Player not found" : "Profile unavailable"} description={<span role="alert">{error}</span>}
      action={!missing && <Button icon={<Icon name="refresh" />} onClick={() => setRetry(value => value + 1)}>Retry profile</Button>} /> :
      profile ? <article className="player-profile" aria-label="Public player profile">
        <header className="player-cover">
          <Avatar name={profile.displayName} size="xl" />
          <div className="player-identity">
            <Badge tone="violet">notsu player</Badge>
            <h2>{profile.displayName}</h2>
            <p className="account-handle">@{profile.username}</p>
            {joined && Number.isFinite(joined.getTime()) && <p className="ui-text-muted ui-text-small">Profile created <time dateTime={profile.createdAt}>{joined.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</time></p>}
          </div>
          {identity?.id === profile.id && <ButtonLink className="player-edit" size="sm" to="/account">Edit your profile</ButtonLink>}
        </header>
        <div className="player-body">
          {profile.bio && <Panel title="About" headingLevel={3}><p className="ui-prose">{profile.bio}</p></Panel>}
          <ProfileConnection key={`${identity?.id ?? "guest"}:${profile.id}`} target={profile.id} username={profile.username} />
        </div>
      </article> : <p className="ui-text-muted">Enter a username to open their public profile.</p>}
  </Page></AppScreen>;
}
