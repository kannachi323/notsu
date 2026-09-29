import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { HomeHeader } from "../../home/components/HomeHeader";
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
  return <div className="notsu-home account-screen"><HomeHeader /><main className="account-main player-main">
    <header className="account-heading"><Link to="/">← Home</Link><h1>Players</h1><p>Find a player by their exact username.</p></header>
    <form className="account-panel player-search" role="search" onSubmit={event => { event.preventDefault(); search(); }}>
      <label>Player username<input autoComplete="off" spellCheck={false} required maxLength={21} placeholder="@username" value={query} onChange={event => setQuery(event.target.value)} /></label><button className="account-primary" type="submit">Find player</button>
      {queryError && <p className="account-error" role="alert">{queryError}</p>}
    </form>
    {loading ? <p className="player-status" role="status">Loading player…</p> : error ? <section className="account-panel player-card"><h2>{missing ? "Player not found" : "Profile unavailable"}</h2><p role="alert" className="account-muted">{error}</p>{!missing && <button onClick={() => setRetry(value => value + 1)}>Retry profile</button>}</section> :
      profile ? <article className="account-panel player-card" aria-label="Public player profile">
        <div className="player-profile-head"><div className="account-orbit" aria-hidden="true"><i /><span>{[...profile.displayName][0]?.toUpperCase()}</span></div>
          <div><p className="player-eyebrow">notsu player</p><h2>{profile.displayName}</h2><p className="account-handle">@{profile.username}</p>
            {joined && Number.isFinite(joined.getTime()) && <p className="account-muted">Profile created <time dateTime={profile.createdAt}>{joined.toLocaleDateString(undefined, { month: "long", year: "numeric", timeZone: "UTC" })}</time></p>}
          </div></div>
        {profile.bio && <div className="player-about"><h3>About</h3><p className="account-bio">{profile.bio}</p></div>}
        {identity?.id === profile.id && <Link className="account-guest" to="/account">Edit your profile →</Link>}
        <ProfileConnection key={`${identity?.id ?? "guest"}:${profile.id}`} target={profile.id} username={profile.username} />
      </article> : <p className="player-status account-muted">Enter a username to open their public profile.</p>}
  </main><footer className="notsu-footer">Unofficial community project · Not affiliated with ppy</footer></div>;
}
